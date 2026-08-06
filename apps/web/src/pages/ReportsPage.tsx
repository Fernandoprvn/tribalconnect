import { AssessmentOutlined, CalendarMonthOutlined, DownloadOutlined, FileDownloadOutlined, PictureAsPdfOutlined, TableChartOutlined, TrendingUpOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Skeleton, Stack, Typography, alpha, useTheme } from '@mui/material';
import { useMutation, useQuery } from '@tanstack/react-query';
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { dashboardApi, reportsApi, type DashboardFilters, type ExportFormat, type ReportKind } from '../lib/operations';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

type DateRange = '30d' | 'month' | 'quarter' | 'year';
type FilterKey = 'districtId' | 'villageId' | 'officerId' | 'schemeId';

const reportLibrary: Array<{ title: string; description: string; report: ReportKind }> = [
  { title: 'Officer performance report', description: 'Registration, applications and approvals grouped by assigned officer', report: 'officers' },
  { title: 'Monthly delivery report', description: 'Monthly registration, application and approval analytics for review meetings', report: 'monthly' },
  { title: 'Beneficiary benefit report', description: 'Family-level profile and approved-scheme information across the selected scope', report: 'beneficiaries' },
];

function toDateInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function datesForRange(range: DateRange): Pick<DashboardFilters, 'dateFrom' | 'dateTo'> {
  const end = new Date();
  let start = new Date(end);
  if (range === '30d') start.setDate(start.getDate() - 29);
  if (range === 'month') {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    end.setDate(0);
  }
  if (range === 'quarter') start = new Date(end.getFullYear(), Math.floor(end.getMonth() / 3) * 3, 1);
  if (range === 'year') start = new Date(end.getFullYear(), 0, 1);
  return { dateFrom: toDateInput(start), dateTo: toDateInput(end) };
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formattedTimestamp(value?: string) {
  if (!value) return 'Live data';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : `Updated ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)}`;
}

function formatMetricLabel(key: string) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function ReportsPage() {
  const theme = useTheme();
  const [selectedRange, setSelectedRange] = useState<DateRange>('month');
  const [reportKind, setReportKind] = useState<ReportKind>('beneficiaries');
  const [filters, setFilters] = useState<DashboardFilters>({});
  const reportFilters = useMemo(() => ({ ...filters, ...datesForRange(selectedRange), report: reportKind }), [filters, reportKind, selectedRange]);
  const reportQuery = useQuery({ queryKey: ['reports', reportFilters], queryFn: () => reportsApi.summary(reportFilters) });
  const dashboardFilterQuery = useQuery({ queryKey: ['dashboard-filter-options'], queryFn: dashboardApi.filters, staleTime: 5 * 60_000 });
  const summary = reportQuery.data;
  const reportFiltersFromApi = summary?.filters;
  const dashboardFilters = dashboardFilterQuery.data;
  const options = reportFiltersFromApi && (
    reportFiltersFromApi.districts.length || reportFiltersFromApi.villages.length || reportFiltersFromApi.officers.length || reportFiltersFromApi.schemes.length
  ) ? reportFiltersFromApi : dashboardFilters ?? { districts: [], villages: [], officers: [], schemes: [] };
  const updateFilter = (key: FilterKey, value: string) => {
    setFilters((current) => {
      const next: DashboardFilters = { ...current, [key]: value || undefined };
      if (key === 'districtId') next.villageId = undefined;
      return next;
    });
  };
  const downloadMutation = useMutation({
    mutationFn: ({ format, report }: { format: ExportFormat; report?: ReportKind }) => reportsApi.download(format, { ...reportFilters, report }),
    onSuccess: ({ blob, fileName }) => triggerDownload(blob, fileName),
  });
  const totals = summary ? Object.entries(summary.totals) : [];
  const overviewMetrics = [
    { label: 'Families', value: summary?.totals.families ?? 0, color: '#0B6E4F' },
    { label: 'Applications', value: summary?.totals.applications ?? 0, color: '#1F7A8C' },
    { label: 'Approved', value: summary?.totals.approvedApplications ?? 0, color: '#6D4FC2' },
    { label: 'Benefits received', value: summary?.totals.benefitsReceived ?? 0, color: '#D97706' },
  ];
  const hasOverviewMetrics = overviewMetrics.some((metric) => metric.value > 0);
  const hasReportData = Boolean(summary && Object.keys(summary.totals).length);
  const chartData = {
    labels: overviewMetrics.map((item) => item.label),
    datasets: [
      { label: 'Records', data: overviewMetrics.map((item) => item.value), backgroundColor: overviewMetrics.map((item) => item.color), borderRadius: 7, borderSkipped: false },
    ],
  };

  const exportReport = (format: ExportFormat, report?: ReportKind) => downloadMutation.mutate({ format, report: report ?? reportKind });

  return (
    <Box>
      <PageHeader title="Reports" eyebrow="Analytics & exports" description="Create clear, shareable snapshots of welfare delivery across your district." action={<Button variant="contained" startIcon={<FileDownloadOutlined />} disabled={downloadMutation.isPending} onClick={() => exportReport('csv')}>Export current view</Button>} />
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, mb: 2.4 }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} alignItems={{ md: 'center' }}><Stack direction="row" spacing={.75} alignItems="center" sx={{ color: 'text.secondary', minWidth: 120 }}><CalendarMonthOutlined fontSize="small" /><Typography variant="body2" fontWeight={800}>Report scope</Typography></Stack><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.1} sx={{ flex: 1, flexWrap: 'wrap', rowGap: 1.1 }}><FormControl size="small" sx={{ minWidth: 155 }}><InputLabel>Report</InputLabel><Select value={reportKind} onChange={(event) => setReportKind(event.target.value as ReportKind)} label="Report"><MenuItem value="beneficiaries">Beneficiaries</MenuItem><MenuItem value="officers">Officer performance</MenuItem><MenuItem value="monthly">Monthly analytics</MenuItem></Select></FormControl><FormControl size="small" sx={{ minWidth: 155 }}><InputLabel>District</InputLabel><Select value={filters.districtId ?? ''} onChange={(event) => updateFilter('districtId', event.target.value)} label="District"><MenuItem value="">All districts</MenuItem>{options.districts.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 155 }}><InputLabel>Village</InputLabel><Select value={filters.villageId ?? ''} onChange={(event) => updateFilter('villageId', event.target.value)} label="Village"><MenuItem value="">All villages</MenuItem>{options.villages.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 155 }}><InputLabel>Officer</InputLabel><Select value={filters.officerId ?? ''} onChange={(event) => updateFilter('officerId', event.target.value)} label="Officer"><MenuItem value="">All officers</MenuItem>{options.officers.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 155 }}><InputLabel>Scheme</InputLabel><Select value={filters.schemeId ?? ''} onChange={(event) => updateFilter('schemeId', event.target.value)} label="Scheme"><MenuItem value="">All schemes</MenuItem>{options.schemes.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl><FormControl size="small" sx={{ minWidth: 155 }}><InputLabel>Period</InputLabel><Select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value as DateRange)} label="Period"><MenuItem value="30d">Last 30 days</MenuItem><MenuItem value="month">Last month</MenuItem><MenuItem value="quarter">This quarter</MenuItem><MenuItem value="year">This year</MenuItem></Select></FormControl></Stack></Stack></Paper>
      {(reportQuery.isError || downloadMutation.isError) && <Alert severity="error" sx={{ mb: 2.2 }} action={<Button color="inherit" size="small" onClick={() => void reportQuery.refetch()}>Retry</Button>}>{downloadMutation.isError ? 'The report file could not be generated. Please try again.' : 'The report summary could not be loaded.'}</Alert>}
      {reportQuery.isLoading && !summary && <Grid container spacing={2.2}><Grid size={{ xs: 12, lg: 7 }}><Card variant="outlined"><CardContent><Skeleton height={34} width="42%" /><Skeleton variant="rectangular" height={250} sx={{ mt: 2, borderRadius: 2 }} /></CardContent></Card></Grid><Grid size={{ xs: 12, lg: 5 }}><Card variant="outlined"><CardContent><Skeleton height={30} width="45%" /><Skeleton height={90} /></CardContent></Card></Grid></Grid>}
      {!reportQuery.isLoading && summary && !hasReportData && <Paper variant="outlined" sx={{ py: 7, px: 3, textAlign: 'center' }}><AssessmentOutlined color="disabled" sx={{ fontSize: 40 }} /><Typography variant="h6" sx={{ mt: 1 }}>No report data for this scope</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Change the filters or select a wider period to generate a report.</Typography></Paper>}
      {summary && hasReportData && <>
        <Grid container spacing={2.2}><Grid size={{ xs: 12, lg: 7 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent sx={{ p: { xs: 2, sm: 2.6 }, '&:last-child': { pb: { xs: 2, sm: 2.6 } } }}><Stack direction="row" justifyContent="space-between"><Box><Typography variant="h6">Delivery overview</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .3 }}>Live family and application totals for the selected period</Typography></Box><Chip icon={<TrendingUpOutlined sx={{ fontSize: '16px !important' }} />} label={formattedTimestamp(summary.generatedAt)} size="small" sx={{ bgcolor: '#DDF4E5', color: '#176B3A' }} /></Stack><Box sx={{ height: 280, mt: 2.2 }}>{hasOverviewMetrics ? <Bar data={chartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Inter' } } }, tooltip: { backgroundColor: '#173229' } }, scales: { x: { stacked: true, grid: { display: false }, border: { display: false } }, y: { stacked: true, grid: { color: alpha(theme.palette.text.primary, .08) }, border: { display: false }, ticks: { maxTicksLimit: 5 } } } }} /> : <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}><Typography variant="body2" color="text.secondary">No live delivery metrics are available for this scope.</Typography></Box>}</Box></CardContent></Card></Grid><Grid size={{ xs: 12, lg: 5 }}><Stack spacing={2.1}><Card variant="outlined"><CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}><Stack direction="row" spacing={1.1} alignItems="center"><Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', borderRadius: 2.2, bgcolor: alpha(theme.palette.primary.main, .1), color: 'primary.main' }}><AssessmentOutlined /></Box><Box><Typography variant="body2" color="text.secondary">Report readiness</Typography><Typography variant="h6">Live source data loaded</Typography></Box></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.55 }}>{formattedTimestamp(summary.generatedAt)}. Export files are generated by the server using the selected scope.</Typography><Stack spacing={.55} sx={{ mt: 1.25 }}>{totals.map(([key, value]) => <Stack key={key} direction="row" justifyContent="space-between"><Typography variant="caption" color="text.secondary">{formatMetricLabel(key)}</Typography><Typography variant="caption" fontWeight={800}>{new Intl.NumberFormat('en-IN').format(value)}</Typography></Stack>)}</Stack></CardContent></Card><Card variant="outlined"><CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}><Typography variant="h6">Quick export</Typography><Stack spacing={1} sx={{ mt: 1.3 }}><Button variant="outlined" fullWidth startIcon={<PictureAsPdfOutlined />} disabled={downloadMutation.isPending} onClick={() => exportReport('pdf')}>Download PDF summary</Button><Button variant="outlined" fullWidth startIcon={<TableChartOutlined />} disabled={downloadMutation.isPending} onClick={() => exportReport('csv')}>Download CSV data</Button><Button variant="outlined" fullWidth startIcon={<DownloadOutlined />} disabled={downloadMutation.isPending} onClick={() => exportReport('xlsx')}>Export Excel workbook</Button></Stack></CardContent></Card></Stack></Grid></Grid>
        <Typography variant="h6" sx={{ mt: 3.3, mb: 1.5 }}>Report library</Typography><Grid container spacing={2}>{reportLibrary.map((report) => <Grid key={report.title} size={{ xs: 12, sm: 6, xl: 4 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}><Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: 2.3, bgcolor: alpha(theme.palette.primary.main, .1), color: 'primary.main' }}><AssessmentOutlined /></Box><Typography variant="h6" sx={{ mt: 1.55 }}>{report.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .6, lineHeight: 1.55 }}>{report.description}</Typography><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.7 }}><Typography variant="caption" color="text.secondary">{formattedTimestamp(summary.generatedAt)}</Typography><Button size="small" endIcon={<DownloadOutlined />} disabled={downloadMutation.isPending} onClick={() => exportReport('xlsx', report.report)}>Generate</Button></Stack></CardContent></Card></Grid>)}</Grid>
      </>}
    </Box>
  );
}
