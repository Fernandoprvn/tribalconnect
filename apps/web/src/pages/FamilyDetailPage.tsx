import { AddTaskOutlined, ArrowBack, CalendarMonthOutlined, DownloadOutlined, EditOutlined, PictureAsPdfOutlined, ScheduleOutlined, UploadFileOutlined, VerifiedOutlined, VisibilityOutlined } from '@mui/icons-material';
import { Alert, Avatar, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, Grid, InputLabel, LinearProgress, List, ListItem, ListItemIcon, ListItemText, MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Typography, alpha, useTheme } from '@mui/material';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { EmptyState, ErrorState, PageSkeleton } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import { apiDownload } from '../lib/api';
import { dateLabel, numberValue, primaryApi, titleCase, type DocumentStatus, type FamilyStatus, type PrimaryFamily } from '../lib/primaryRecords';
import type { RootState } from '../store';

const transitions: Record<FamilyStatus, FamilyStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['DOCUMENT_VERIFICATION', 'REJECTED'],
  DOCUMENT_VERIFICATION: ['FIELD_VISIT', 'REJECTED'],
  FIELD_VISIT: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
};

function FamilyStatusChip({ status }: { status: FamilyStatus }) {
  const color = status === 'APPROVED' ? 'success' : status === 'REJECTED' ? 'error' : status === 'DRAFT' ? 'default' : status === 'FIELD_VISIT' ? 'info' : 'warning';
  return <Chip label={titleCase(status)} color={color} size="small" variant={status === 'APPROVED' ? 'filled' : 'outlined'} />;
}

function detailPairs(family: PrimaryFamily) {
  return [
    ['Community', family.tribalCommunity],
    ['Family members', `${family.members?.length ?? family._count?.members ?? 0} members`],
    ['Annual income', `₹${numberValue(family.income?.annualIncome).toLocaleString('en-IN')}`],
    ['Primary occupation', family.income?.primaryOccupation || 'Not recorded'],
    ['House type', family.income?.houseType ? titleCase(family.income.houseType) : 'Not recorded'],
    ['Land ownership', family.income?.landOwnershipAcres != null ? `${numberValue(family.income.landOwnershipAcres)} acres` : 'Not recorded'],
    ['Ration card', family.income?.rationCardNumber || 'Not recorded'],
    ['Bank account', family.income?.hasBankAccount ? `Recorded · XXXX ${family.income.bankAccountLast4 ?? ''}` : 'Not recorded'],
  ];
}

export default function FamilyDetailPage() {
  const { familyId = '' } = useParams();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const session = useSelector((state: RootState) => state.session);
  const [tab, setTab] = useState(0);
  const [statusOpen, setStatusOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<FamilyStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitPurpose, setVisitPurpose] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);
  const familyQuery = useQuery({ queryKey: ['family', familyId], queryFn: () => primaryApi.families.get(familyId), enabled: Boolean(familyId) });
  const timelineQuery = useQuery({ queryKey: ['family-timeline', familyId], queryFn: () => primaryApi.families.timeline(familyId), enabled: Boolean(familyId) });
  const eligibilityQuery = useQuery({ queryKey: ['family-eligibility', familyId], queryFn: () => primaryApi.families.eligibility(familyId), enabled: Boolean(familyId) });
  const family = familyQuery.data;
  const canReview = session.role === 'SUPER_ADMIN' || session.role === 'DEVELOPMENT_OFFICER';
  // Scheduling here creates a visit assigned to the signed-in volunteer. Officers
  // can review the history, while the dedicated volunteer workspace handles GPS capture.
  const canVisit = session.role === 'FIELD_VOLUNTEER';
  const refresh = async () => {
    await Promise.all([familyQuery.refetch(), timelineQuery.refetch(), eligibilityQuery.refetch()]);
  };
  const statusMutation = useMutation({ mutationFn: (input: { status: FamilyStatus; note?: string; rejectionReason?: string }) => primaryApi.families.setStatus(familyId, input), onSuccess: () => { void refresh(); setStatusOpen(false); setNextStatus(''); setStatusNote(''); } });
  const documentMutation = useMutation({ mutationFn: ({ documentId, status, rejectionNote }: { documentId: string; status: DocumentStatus; rejectionNote?: string }) => primaryApi.families.verifyDocument(familyId, documentId, { status, rejectionNote }), onSuccess: () => void familyQuery.refetch() });
  const visitMutation = useMutation({ mutationFn: () => primaryApi.families.addVisit(familyId, { scheduledAt: new Date(visitDate).toISOString(), purpose: visitPurpose, status: 'SCHEDULED' }), onSuccess: () => { void refresh(); setVisitOpen(false); setVisitDate(''); setVisitPurpose(''); } });
  const applicationMutation = useMutation({ mutationFn: (schemeId: string) => primaryApi.applications.create({ familyId, schemeId }), onSuccess: () => { setApplyError(null); void refresh(); void queryClient.invalidateQueries({ queryKey: ['applications'] }); }, onError: (error) => setApplyError(error instanceof Error ? error.message : 'The scheme application could not be created.') });
  const completion = useMemo(() => {
    if (!family) return 0;
    const factors = [family.address, family.income, family.members?.length, family.documents?.length];
    return Math.round((factors.filter(Boolean).length / factors.length) * 100);
  }, [family]);

  if (familyQuery.isLoading) return <PageSkeleton rows={5} />;
  if (familyQuery.isError || !family) return <ErrorState title="Family profile could not be loaded" description={familyQuery.error instanceof Error ? familyQuery.error.message : 'The selected family may no longer be available.'} onRetry={() => void refresh()} />;

  const eligible = eligibilityQuery.data?.eligibleSchemes ?? [];
  const applications = family.applications ?? [];
  return (
    <Box>
      <Button component={Link} to="/families" startIcon={<ArrowBack />} size="small" sx={{ mb: 1.5 }}>All families</Button>
      <PageHeader title={family.headName} eyebrow={`Beneficiary registry · ${family.familyCode}`} description={`${family.village?.name ?? 'Village unavailable'}, ${family.panchayatName || family.village?.panchayat?.name || 'Panchayat unavailable'}, ${family.district?.name ?? 'District unavailable'}`} action={<Stack direction="row" spacing={1}><Button component={Link} to={`/families/${family.id}/edit`} variant="outlined" startIcon={<EditOutlined />} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Edit profile</Button>{canReview && transitions[family.status].length > 0 && <Button variant="contained" onClick={() => setStatusOpen(true)} startIcon={<VerifiedOutlined />}>Update status</Button>}</Stack>} />

      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3.5, mb: 2.4 }}>
        <Box sx={{ p: { xs: 2, sm: 2.7 }, background: `linear-gradient(105deg, ${alpha(theme.palette.primary.main, .14)}, ${alpha(theme.palette.primary.main, .03)})` }}><Grid container spacing={2.5} alignItems="center"><Grid size={{ xs: 12, sm: 'auto' }}><Avatar sx={{ width: 74, height: 74, bgcolor: 'primary.main', fontSize: '1.45rem', fontWeight: 800 }}>{family.headName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Avatar></Grid><Grid size={{ xs: 12, sm: 'grow' }}><Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} justifyContent="space-between" alignItems={{ md: 'center' }}><Box><Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap"><Typography variant="h5">{family.headName}</Typography><FamilyStatusChip status={family.status} /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .8 }}>{family.mobile} · {family.aadhaarMasked} · {family.village?.name ?? 'Village unavailable'}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Profile completeness</Typography><Stack direction="row" alignItems="center" spacing={1}><Box sx={{ width: 106 }}><LinearProgress variant="determinate" value={completion} sx={{ height: 8, borderRadius: 99, bgcolor: alpha(theme.palette.primary.main, .13), '& .MuiLinearProgress-bar': { borderRadius: 99 } }} /></Box><Typography variant="body2" fontWeight={800}>{completion}%</Typography></Stack></Box></Stack></Grid></Grid></Box>
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: { xs: 1, sm: 2 }, borderTop: `1px solid ${theme.palette.divider}` }}><Tab label="Overview" /><Tab label={`Members (${family.members?.length ?? 0})`} /><Tab label={`Documents (${family.documents?.length ?? 0})`} /><Tab label={`Applications (${applications.length})`} /><Tab label="Visit history" /></Tabs>
      </Paper>

      {tab === 0 && <Grid container spacing={2.25}>
        <Grid size={{ xs: 12, lg: 8 }}><Stack spacing={2.25}>
          <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.7 } }}><Typography variant="h6">Family details</Typography><Grid container spacing={2.25} sx={{ mt: .35 }}>{detailPairs(family).map(([label, value]) => <Grid key={label} size={{ xs: 6, sm: 3 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={800} sx={{ mt: .25 }}>{value}</Typography></Grid>)}</Grid></CardContent></Card>
          <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.7 } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Typography variant="h6">Eligible schemes</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Live eligibility is evaluated from this household’s recorded profile.</Typography></Box><Button component={Link} to={`/eligibility?familyId=${family.id}`} size="small">View all results</Button></Stack>{applyError && <Alert severity="error" sx={{ mt: 1.5 }} onClose={() => setApplyError(null)}>{applyError}</Alert>}<Stack spacing={1.15} sx={{ mt: 2 }}>{eligibilityQuery.isLoading && <Typography variant="body2" color="text.secondary">Evaluating active schemes…</Typography>}{eligible.slice(0, 4).map((result) => <Paper key={result.schemeId} variant="outlined" sx={{ p: 1.55, borderRadius: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.1}><Box><Typography variant="body2" fontWeight={800}>{result.schemeName}</Typography><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .45 }}>{result.schemeCode} · All configured criteria passed</Typography></Box><Button size="small" disabled={applicationMutation.isPending} onClick={() => applicationMutation.mutate(result.schemeId)} startIcon={<AddTaskOutlined />}>{session.role === 'FAMILY' ? 'Apply' : 'Recommend'}</Button></Stack></Paper>)}{!eligibilityQuery.isLoading && eligible.length === 0 && <EmptyState title="No eligible scheme found" description="Update missing household details or review the currently active scheme rules." />}</Stack></CardContent></Card>
        </Stack></Grid>
        <Grid size={{ xs: 12, lg: 4 }}><Stack spacing={2.25}><Card variant="outlined"><CardContent sx={{ p: 2.4 }}><Typography variant="h6">Assigned officer</Typography>{family.assignedOfficer ? <Stack direction="row" spacing={1.1} alignItems="center" sx={{ mt: 1.5 }}><Avatar sx={{ bgcolor: '#E1F2E9', color: 'primary.main', fontSize: '.75rem', fontWeight: 800 }}>{family.assignedOfficer.fullName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Avatar><Box><Typography variant="body2" fontWeight={800}>{family.assignedOfficer.fullName}</Typography><Typography variant="caption" color="text.secondary">Development Officer</Typography></Box></Stack> : <Typography variant="body2" color="text.secondary" sx={{ mt: 1.1 }}>No officer is assigned yet.</Typography>}</CardContent></Card><Card variant="outlined"><CardContent sx={{ p: 2.4 }}><Typography variant="h6">Latest workflow</Typography><Stack spacing={1.15} sx={{ mt: 1.4 }}>{(timelineQuery.data?.workflow ?? family.workflowEvents ?? []).slice(0, 4).map((event) => <Box key={event.id}><Typography variant="body2" fontWeight={800}>{event.title}</Typography><Typography variant="caption" color="text.secondary">{dateLabel(event.createdAt, true)}{event.actorName ? ` · ${event.actorName}` : ''}</Typography></Box>)}{!timelineQuery.isLoading && !(timelineQuery.data?.workflow ?? family.workflowEvents ?? []).length && <Typography variant="body2" color="text.secondary">No workflow events recorded yet.</Typography>}</Stack></CardContent></Card></Stack></Grid>
      </Grid>}

      {tab === 1 && <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.7 } }}><Typography variant="h6">Household members</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Identity details are visible only to authorised staff.</Typography><List sx={{ mt: 1.4 }}>{(family.members ?? []).map((member, index, members) => <ListItem key={member.id} divider={index < members.length - 1} disableGutters><Avatar sx={{ mr: 1.4, bgcolor: alpha(theme.palette.primary.main, .12), color: 'primary.main' }}>{member.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Avatar><ListItemText primary={<Typography fontWeight={800}>{member.name}</Typography>} secondary={`${titleCase(member.gender)} · ${member.age ?? 'Age not recorded'} years · ${member.relationship}${member.occupation ? ` · ${member.occupation}` : ''}`} /><Stack direction="row" gap={.6}>{member.isStudent && <Chip label="Student" size="small" variant="outlined" />}{member.hasDisability && <Chip label="Disability recorded" size="small" color="warning" variant="outlined" />}</Stack></ListItem>)}{!family.members?.length && <EmptyState title="No household members recorded" description="Edit the family profile to add the people living in this household." />}</List></CardContent></Card>}

      {tab === 2 && <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.7 } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Typography variant="h6">Uploaded documents</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Document access and verification changes are audit logged.</Typography></Box><Button component={Link} to={`/families/${family.id}/edit`} variant="outlined" startIcon={<UploadFileOutlined />}>Upload through edit</Button></Stack><List sx={{ mt: 1.3 }}>{(family.documents ?? []).map((document, index, documents) => <ListItem key={document.id} divider={index < documents.length - 1} disableGutters secondaryAction={<Stack direction="row" spacing={.5} alignItems="center"><Chip label={titleCase(document.status)} size="small" color={document.status === 'VERIFIED' ? 'success' : document.status === 'REJECTED' ? 'error' : 'warning'} variant="outlined" /><Button size="small" startIcon={<VisibilityOutlined />} onClick={() => apiDownload(`/families/${family.id}/documents/${document.id}/file`, document.fileName).catch(() => undefined)}>View</Button>{canReview && document.status !== 'VERIFIED' && <Button size="small" color="success" disabled={documentMutation.isPending} onClick={() => documentMutation.mutate({ documentId: document.id, status: 'VERIFIED' })}>Verify</Button>}</Stack>}><ListItemIcon><PictureAsPdfOutlined color={document.mimeType === 'application/pdf' ? 'error' : 'primary'} /></ListItemIcon><ListItemText primary={<Typography fontWeight={800}>{document.fileName}</Typography>} secondary={`${titleCase(document.type)} · ${Math.max(1, Math.round(document.sizeBytes / 1024))} KB · uploaded ${dateLabel(document.createdAt)}`} /></ListItem>)}{!family.documents?.length && <EmptyState title="No documents uploaded" description="Use Edit profile to attach the required household documents." />}</List></CardContent></Card>}

      {tab === 3 && <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.7 } }}><Typography variant="h6">Scheme applications</Typography><Stack spacing={1.2} sx={{ mt: 1.5 }}>{applications.map((application) => <Paper key={application.id} variant="outlined" sx={{ p: 1.5, borderRadius: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Typography fontWeight={800}>{application.scheme.name}</Typography><Typography variant="caption" color="text.secondary">{application.applicationNumber} · {application.scheme.code}</Typography></Box><Stack direction="row" spacing={.75} alignItems="center"><Chip label={titleCase(application.status)} size="small" color={application.status === 'APPROVED' || application.status === 'BENEFIT_RECEIVED' ? 'success' : application.status === 'REJECTED' ? 'error' : 'warning'} variant="outlined" />{(application.status === 'APPROVED' || application.status === 'BENEFIT_RECEIVED') && <Button size="small" startIcon={<DownloadOutlined />} onClick={() => apiDownload(`/applications/${application.id}/approval-letter`, `${application.applicationNumber}-approval-letter.pdf`).catch(() => undefined)}>Letter</Button>}</Stack></Stack></Paper>)}{!applications.length && <EmptyState title="No scheme applications yet" description="Eligible schemes can be recommended from the Overview tab." />}</Stack></CardContent></Card>}

      {tab === 4 && <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.7 } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Typography variant="h6">Visit history</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Scheduled and completed visits are retained with their location evidence.</Typography></Box>{canVisit && <Button variant="outlined" startIcon={<CalendarMonthOutlined />} onClick={() => setVisitOpen(true)}>Schedule visit</Button>}</Stack><Stack spacing={1.2} sx={{ mt: 1.8 }}>{(timelineQuery.data?.fieldVisits ?? family.fieldVisits ?? []).map((visit) => <Paper key={visit.id} variant="outlined" sx={{ p: 1.7 }}><Stack direction="row" spacing={1.2}><CalendarMonthOutlined color="primary" /><Box><Typography variant="body2" fontWeight={800}>{visit.purpose}</Typography><Typography variant="caption" color="text.secondary">{titleCase(visit.status)} · {dateLabel(visit.scheduledAt, true)}{visit.volunteer?.fullName ? ` · ${visit.volunteer.fullName}` : ''}</Typography>{visit.notes && <Typography variant="body2" sx={{ mt: .55 }}>{visit.notes}</Typography>}</Box></Stack></Paper>)}{!timelineQuery.isLoading && !(timelineQuery.data?.fieldVisits ?? family.fieldVisits ?? []).length && <EmptyState title="No visits recorded" description="Schedule a household visit when verification needs field evidence." />}</Stack></CardContent></Card>}

      <Dialog open={statusOpen} onClose={() => setStatusOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Update family status</DialogTitle><DialogContent><FormControl fullWidth sx={{ mt: .5 }}><InputLabel>Next status</InputLabel><Select value={nextStatus} label="Next status" onChange={(event) => setNextStatus(event.target.value as FamilyStatus)}>{transitions[family.status].map((item) => <MenuItem key={item} value={item}>{titleCase(item)}</MenuItem>)}</Select></FormControl><TextField fullWidth multiline minRows={3} label={nextStatus === 'REJECTED' ? 'Rejection reason' : 'Note (optional)'} value={statusNote} onChange={(event) => setStatusNote(event.target.value)} sx={{ mt: 2 }} />{statusMutation.isError && <Alert severity="error" sx={{ mt: 1.5 }}>{statusMutation.error instanceof Error ? statusMutation.error.message : 'Status could not be updated.'}</Alert>}</DialogContent><DialogActions><Button onClick={() => setStatusOpen(false)}>Cancel</Button><Button variant="contained" disabled={!nextStatus || statusMutation.isPending || (nextStatus === 'REJECTED' && !statusNote.trim())} onClick={() => statusMutation.mutate({ status: nextStatus as FamilyStatus, note: nextStatus === 'REJECTED' ? undefined : statusNote || undefined, rejectionReason: nextStatus === 'REJECTED' ? statusNote : undefined })}>Save status</Button></DialogActions></Dialog>
      <Dialog open={visitOpen} onClose={() => setVisitOpen(false)} fullWidth maxWidth="xs"><DialogTitle>Schedule field visit</DialogTitle><DialogContent><TextField fullWidth type="datetime-local" label="Visit date and time" InputLabelProps={{ shrink: true }} value={visitDate} onChange={(event) => setVisitDate(event.target.value)} sx={{ mt: .5 }} /><TextField fullWidth label="Purpose" value={visitPurpose} onChange={(event) => setVisitPurpose(event.target.value)} sx={{ mt: 2 }} />{visitMutation.isError && <Alert severity="error" sx={{ mt: 1.5 }}>{visitMutation.error instanceof Error ? visitMutation.error.message : 'Visit could not be scheduled.'}</Alert>}</DialogContent><DialogActions><Button onClick={() => setVisitOpen(false)}>Cancel</Button><Button variant="contained" disabled={!visitDate || !visitPurpose.trim() || visitMutation.isPending} onClick={() => visitMutation.mutate()} startIcon={<ScheduleOutlined />}>Schedule</Button></DialogActions></Dialog>
    </Box>
  );
}
