import { ApplicationStatus, Role } from '@prisma/client';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowPermission, requireAuth } from '../middleware/auth';
import { withFamilyScope } from '../services/family-access.service';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';
import { jsonSafe } from '../utils/serializers';

export const reportsRouter = Router();

const reportQuerySchema = z.object({
  format: z.enum(['csv', 'xlsx', 'pdf']).optional(),
  report: z.enum(['beneficiaries', 'officers', 'monthly']).default('beneficiaries'),
  districtId: z.string().uuid().optional(),
  villageId: z.string().uuid().optional(),
  officerId: z.string().uuid().optional(),
  schemeId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

type ReportInput = z.infer<typeof reportQuerySchema>;

const parseDate = (value: string | undefined, endOfDay = false) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(422, 'Enter a valid report date.');
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
};

const csvCell = (value: unknown) => {
  const raw = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
};

const toNumber = (value: unknown) => value && typeof value === 'object' && 'toNumber' in value && typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ? (value as { toNumber: () => number }).toNumber()
  : value;

const buildReport = async (request: Parameters<typeof requireAuth>[0], input: ReportInput) => {
  if (input.report === 'officers' && request.auth!.role === Role.FAMILY) {
    throw new ApiError(403, 'Officer reports are unavailable to family portal accounts.');
  }
  const dateFrom = parseDate(input.dateFrom);
  const dateTo = parseDate(input.dateTo, true);
  const familyWhere = withFamilyScope(request, {
    ...(input.districtId ? { districtId: input.districtId } : {}),
    ...(input.villageId ? { villageId: input.villageId } : {}),
    ...(input.officerId ? { assignedOfficerId: input.officerId } : {}),
    ...(input.schemeId ? { applications: { some: { schemeId: input.schemeId } } } : {}),
    ...(dateFrom || dateTo ? { createdAt: { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
  });
  const families = await prisma.family.findMany({
    where: familyWhere,
    include: {
      district: { select: { name: true } },
      village: { select: { name: true } },
      assignedOfficer: { select: { id: true, fullName: true } },
      income: { select: { annualIncome: true } },
      applications: {
        where: input.schemeId ? { schemeId: input.schemeId } : undefined,
        include: { scheme: { select: { code: true, name: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  const applications = families.flatMap((family) => family.applications);
  const summary = {
    families: families.length,
    applications: applications.length,
    approvedApplications: applications.filter((application) => application.status === ApplicationStatus.APPROVED || application.status === ApplicationStatus.BENEFIT_RECEIVED).length,
    benefitsReceived: applications.filter((application) => application.status === ApplicationStatus.BENEFIT_RECEIVED).length,
    generatedAt: new Date().toISOString(),
  };
  if (input.report === 'officers') {
    const groups = new Map<string, { officer: string; district: string; families: number; applications: number; approved: number }>();
    for (const family of families) {
      const key = family.assignedOfficer?.id ?? 'unassigned';
      const row = groups.get(key) ?? { officer: family.assignedOfficer?.fullName ?? 'Unassigned', district: family.district.name, families: 0, applications: 0, approved: 0 };
      row.families += 1;
      row.applications += family.applications.length;
      row.approved += family.applications.filter((application) => application.status === ApplicationStatus.APPROVED || application.status === ApplicationStatus.BENEFIT_RECEIVED).length;
      groups.set(key, row);
    }
    return { title: 'Officer performance report', summary, columns: ['Officer', 'District', 'Families', 'Applications', 'Approved'], rows: [...groups.values()].map((row) => [row.officer, row.district, row.families, row.applications, row.approved]) };
  }
  if (input.report === 'monthly') {
    const groups = new Map<string, { registrations: number; applications: number; approved: number }>();
    for (const family of families) {
      const key = family.createdAt.toISOString().slice(0, 7);
      const row = groups.get(key) ?? { registrations: 0, applications: 0, approved: 0 };
      row.registrations += 1;
      row.applications += family.applications.length;
      row.approved += family.applications.filter((application) => application.status === ApplicationStatus.APPROVED || application.status === ApplicationStatus.BENEFIT_RECEIVED).length;
      groups.set(key, row);
    }
    return { title: 'Monthly analytics report', summary, columns: ['Month', 'Registrations', 'Applications', 'Approved'], rows: [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, row]) => [month, row.registrations, row.applications, row.approved]) };
  }
  return {
    title: 'Beneficiary report',
    summary,
    columns: ['Family code', 'Head of family', 'District', 'Village', 'Community', 'Annual income', 'Officer', 'Applications', 'Approved schemes'],
    rows: families.map((family) => [
      family.familyCode,
      family.headName,
      family.district.name,
      family.village.name,
      family.tribalCommunity,
      toNumber(family.income?.annualIncome) ?? '',
      family.assignedOfficer?.fullName ?? 'Unassigned',
      family.applications.length,
      family.applications.filter((application) => application.status === ApplicationStatus.APPROVED || application.status === ApplicationStatus.BENEFIT_RECEIVED).map((application) => application.scheme.name).join('; '),
    ]),
  };
};

const writeCsv = (response: Parameters<typeof requireAuth>[1], report: Awaited<ReturnType<typeof buildReport>>) => {
  response.type('text/csv');
  response.setHeader('Content-Disposition', 'attachment; filename="tribalconnect-report.csv"');
  response.send([report.columns, ...report.rows].map((row) => row.map(csvCell).join(',')).join('\n'));
};

const writeXlsx = async (response: Parameters<typeof requireAuth>[1], report: Awaited<ReturnType<typeof buildReport>>) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TribalConnect';
  const sheet = workbook.addWorksheet('Report');
  sheet.addRow([report.title]);
  sheet.addRow([]);
  sheet.addRow(report.columns);
  for (const row of report.rows) sheet.addRow(row);
  sheet.getRow(3).font = { bold: true };
  sheet.columns.forEach((column) => { column.width = Math.min(40, Math.max(14, (column.header?.toString().length ?? 0) + 4)); });
  response.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  response.setHeader('Content-Disposition', 'attachment; filename="tribalconnect-report.xlsx"');
  await workbook.xlsx.write(response);
  response.end();
};

const writePdf = (response: Parameters<typeof requireAuth>[1], report: Awaited<ReturnType<typeof buildReport>>) => {
  response.type('application/pdf');
  response.setHeader('Content-Disposition', 'attachment; filename="tribalconnect-report.pdf"');
  const document = new PDFDocument({ margin: 36, size: 'A4', layout: 'landscape' });
  document.pipe(response);
  document.fontSize(16).text('TribalConnect', { align: 'center' });
  document.fontSize(12).text(report.title, { align: 'center' });
  document.moveDown().fontSize(9).text(`Generated: ${report.summary.generatedAt}`);
  document.text(`Families: ${report.summary.families}   Applications: ${report.summary.applications}   Approved: ${report.summary.approvedApplications}`);
  document.moveDown();
  const widths = report.columns.map(() => 720 / report.columns.length);
  let y = document.y;
  const printRow = (row: unknown[], bold = false) => {
    if (y > 530) { document.addPage(); y = 40; }
    let x = 36;
    document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7);
    row.forEach((value, index) => {
      document.text(String(value ?? ''), x, y, { width: widths[index] - 4, height: 22, ellipsis: true });
      x += widths[index];
    });
    y += 24;
  };
  printRow(report.columns, true);
  report.rows.forEach((row) => printRow(row));
  document.end();
};

reportsRouter.use(requireAuth);

const reportHandler = asyncHandler(async (request, response) => {
  const input = reportQuerySchema.parse(request.query);
  const report = await buildReport(request, input);
  if (!input.format) {
    response.json({ data: jsonSafe({ title: report.title, summary: report.summary, columns: report.columns, rows: report.rows }) });
    return;
  }
  if (input.format === 'csv') return writeCsv(response, report);
  if (input.format === 'xlsx') return writeXlsx(response, report);
  return writePdf(response, report);
});

reportsRouter.get('/', reportHandler);
reportsRouter.get('/export', allowPermission('reports.export', Role.SUPER_ADMIN, Role.DEVELOPMENT_OFFICER), reportHandler);
reportsRouter.get('/summary', asyncHandler(async (request, response) => {
  const input = reportQuerySchema.parse(request.query);
  const report = await buildReport(request, { ...input, report: input.report ?? 'beneficiaries' });
  response.json({ data: report.summary });
}));
