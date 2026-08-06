import { AssignmentOutlined, CheckCircleRounded, FilterListOutlined, HistoryOutlined, OpenInNewOutlined, PendingActionsOutlined, Search, UpdateOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, Grid, InputAdornment, InputLabel, MenuItem, Pagination, Paper, Select, Stack, TextField, Typography, alpha, useTheme } from '@mui/material';
import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, PageSkeleton } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import type { RootState } from '../store';
import { apiDownload } from '../lib/api';
import { dateLabel, primaryApi, titleCase, type ApplicationStatus, type Officer, type SchemeApplication } from '../lib/primaryRecords';

const pageSize = 10;
const applicationStatuses: ApplicationStatus[] = ['RECOMMENDED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'BENEFIT_RECEIVED'];
const transitions: Record<ApplicationStatus, ApplicationStatus[]> = {
  RECOMMENDED: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['BENEFIT_RECEIVED'],
  REJECTED: [],
  BENEFIT_RECEIVED: [],
};

function applicationColor(status: ApplicationStatus) {
  if (status === 'APPROVED' || status === 'BENEFIT_RECEIVED') return 'success' as const;
  if (status === 'REJECTED') return 'error' as const;
  if (status === 'UNDER_REVIEW') return 'info' as const;
  return 'warning' as const;
}

function ApplicationCard({ application, canReview, onHistory, onStatus }: { application: SchemeApplication; canReview: boolean; onHistory: (application: SchemeApplication) => void; onStatus: (application: SchemeApplication) => void }) {
  const theme = useTheme();
  const next = transitions[application.status];
  return (
    <Card variant="outlined">
      <CardContent sx={{ p: { xs: 2, sm: 2.4 }, '&:last-child': { pb: { xs: 2, sm: 2.4 } } }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" spacing={1.8}>
          <Box sx={{ minWidth: { lg: 260 } }}>
            <Stack direction="row" spacing={.8} alignItems="center" flexWrap="wrap">
              <Typography variant="h6">{application.scheme.name}</Typography>
              <Chip label={titleCase(application.status)} color={applicationColor(application.status)} size="small" variant="outlined" />
            </Stack>
            <Typography variant="body2" fontWeight={800} sx={{ mt: .9 }}>{application.family.headName}</Typography>
            <Typography variant="caption" color="text.secondary">{application.applicationNumber} · {application.family.familyCode} · {application.family.village?.name ?? 'Village unavailable'}</Typography>
          </Box>
          <Box sx={{ flex: 1, maxWidth: 540 }}>
            <Paper variant="outlined" sx={{ p: 1.35, borderRadius: 2 }}>
              <Stack direction="row" spacing={.85} alignItems="flex-start">
                <PendingActionsOutlined color="primary" fontSize="small" sx={{ mt: .1 }} />
                <Box>
                  <Typography variant="body2" fontWeight={800}>{application.status === 'REJECTED' ? 'Application rejected' : `${titleCase(application.status)} stage`}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: .28, display: 'block' }}>
                    {application.rejectionReason || application.notes || `Last updated ${dateLabel(application.updatedAt, true)}`}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
            <Stack direction="row" spacing={.65} alignItems="center" sx={{ mt: 1.05, color: 'text.secondary' }}>
              <Box sx={{ height: 7, borderRadius: 99, flex: 1, bgcolor: alpha(theme.palette.primary.main, .11), overflow: 'hidden' }}>
                <Box sx={{ height: '100%', width: `${Math.max(16, ((applicationStatuses.indexOf(application.status) + 1) / applicationStatuses.length) * 100)}%`, bgcolor: application.status === 'REJECTED' ? 'error.main' : 'primary.main', borderRadius: 99 }} />
              </Box>
              <Typography variant="caption">Updated {dateLabel(application.updatedAt)}</Typography>
            </Stack>
          </Box>
          <Stack direction={{ xs: 'row', lg: 'column' }} spacing={.55} justifyContent="center" alignItems={{ lg: 'flex-end' }}>
            <Button component={Link} to={`/families/${application.family.id}`} size="small" endIcon={<OpenInNewOutlined />}>Open profile</Button>
            <Button size="small" startIcon={<HistoryOutlined />} onClick={() => onHistory(application)}>History</Button>
            {(application.status === 'APPROVED' || application.status === 'BENEFIT_RECEIVED') && <Button size="small" onClick={() => void apiDownload(`/applications/${application.id}/approval-letter`, `${application.applicationNumber}-approval-letter.pdf`)}>Letter</Button>}
            {canReview && next.length > 0 && <Button size="small" color="primary" startIcon={<UpdateOutlined />} onClick={() => onStatus(application)}>Update status</Button>}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function ApplicationsPage() {
  const queryClient = useQueryClient();
  const session = useSelector((state: RootState) => state.session);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [schemeId, setSchemeId] = useState('');
  const [status, setStatus] = useState<ApplicationStatus | ''>('');
  const [officerId, setOfficerId] = useState('');
  const [historyApplication, setHistoryApplication] = useState<SchemeApplication | null>(null);
  const [statusApplication, setStatusApplication] = useState<SchemeApplication | null>(null);
  const [nextStatus, setNextStatus] = useState<ApplicationStatus | ''>('');
  const [statusNote, setStatusNote] = useState('');
  const canReview = session.role === 'SUPER_ADMIN' || session.role === 'DEVELOPMENT_OFFICER';
  const applicationsQuery = useQuery({
    queryKey: ['applications', page, deferredSearch, schemeId, status, officerId],
    queryFn: () => primaryApi.applications.list({ page, limit: pageSize, search: deferredSearch || undefined, schemeId: schemeId || undefined, officerId: officerId || undefined, status: status ? [status] : undefined }),
  });
  const schemesQuery = useQuery({ queryKey: ['application-filter-schemes'], queryFn: () => primaryApi.schemes.list({ page: 1, limit: 100 }) });
  const officersQuery = useQuery({ queryKey: ['application-filter-officers'], queryFn: () => primaryApi.geography.officers(), enabled: session.role === 'SUPER_ADMIN' });
  const historyQuery = useQuery({
    queryKey: ['application-history', historyApplication?.id],
    queryFn: () => primaryApi.applications.history(historyApplication!.id),
    enabled: Boolean(historyApplication),
  });
  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: ApplicationStatus; note?: string; rejectionReason?: string }) => primaryApi.applications.setStatus(input.id, input),
    onSuccess: () => {
      setStatusApplication(null);
      setNextStatus('');
      setStatusNote('');
      void queryClient.invalidateQueries({ queryKey: ['applications'] });
      void queryClient.invalidateQueries({ queryKey: ['application-history'] });
    },
  });
  const rows = applicationsQuery.data?.data ?? [];
  const meta = applicationsQuery.data?.meta;
  const officers = useMemo(() => {
    const unique = new Map<string, Officer>();
    (officersQuery.data?.data ?? []).forEach((officer) => unique.set(officer.id, officer));
    rows.forEach((application) => {
      if (application.family.assignedOfficer) unique.set(application.family.assignedOfficer.id, application.family.assignedOfficer);
    });
    return [...unique.values()].sort((left, right) => left.fullName.localeCompare(right.fullName));
  }, [officersQuery.data?.data, rows]);
  const summary = useMemo(() => ({
    open: rows.filter((item) => !['APPROVED', 'REJECTED', 'BENEFIT_RECEIVED'].includes(item.status)).length,
    approved: rows.filter((item) => item.status === 'APPROVED' || item.status === 'BENEFIT_RECEIVED').length,
    attention: rows.filter((item) => item.status === 'RECOMMENDED' || item.status === 'UNDER_REVIEW').length,
  }), [rows]);
  const resetFilters = () => {
    setSearch('');
    setSchemeId('');
    setStatus('');
    setOfficerId('');
    setPage(1);
  };
  const openStatus = (application: SchemeApplication) => {
    setStatusApplication(application);
    setNextStatus(transitions[application.status][0] ?? '');
    setStatusNote('');
  };

  return (
    <Box>
      <PageHeader title="Applications" eyebrow="Benefit tracking" description="Follow every submitted welfare benefit application through review, approval, and benefit delivery." action={<Button component={Link} to="/families" variant="outlined" endIcon={<OpenInNewOutlined />}>Browse families</Button>} />
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, mb: 2.4 }}>
        <Grid container spacing={1.15} alignItems="center">
          <Grid size={{ xs: 12, md: 3 }}><TextField fullWidth size="small" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search application, family or scheme" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><FormControl fullWidth size="small"><InputLabel>Scheme</InputLabel><Select value={schemeId} label="Scheme" onChange={(event) => { setSchemeId(event.target.value); setPage(1); }}><MenuItem value="">All schemes</MenuItem>{(schemesQuery.data?.data ?? []).map((scheme) => <MenuItem value={scheme.id} key={scheme.id}>{scheme.name}</MenuItem>)}</Select></FormControl></Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}><FormControl fullWidth size="small"><InputLabel>Status</InputLabel><Select value={status} label="Status" onChange={(event) => { setStatus(event.target.value as ApplicationStatus | ''); setPage(1); }}><MenuItem value="">All statuses</MenuItem>{applicationStatuses.map((item) => <MenuItem value={item} key={item}>{titleCase(item)}</MenuItem>)}</Select></FormControl></Grid>
          <Grid size={{ xs: 6, sm: 4, md: 2 }}><FormControl fullWidth size="small"><InputLabel>Officer</InputLabel><Select value={officerId} label="Officer" onChange={(event) => { setOfficerId(event.target.value); setPage(1); }}><MenuItem value="">All officers</MenuItem>{officers.map((officer) => <MenuItem value={officer.id} key={officer.id}>{officer.fullName}</MenuItem>)}</Select></FormControl></Grid>
          <Grid size={{ xs: 12, sm: 4, md: 2 }}><Button fullWidth variant="outlined" onClick={resetFilters} startIcon={<FilterListOutlined />}>Reset</Button></Grid>
        </Grid>
      </Paper>
      {applicationsQuery.isLoading ? <PageSkeleton rows={4} /> : applicationsQuery.isError ? <ErrorState title="Applications could not be loaded" description={applicationsQuery.error instanceof Error ? applicationsQuery.error.message : undefined} onRetry={() => void applicationsQuery.refetch()} /> : <>
        <Grid container spacing={2.1} sx={{ mb: 2.35 }}>
          {[
            { label: 'Applications in progress', value: summary.open, icon: <AssignmentOutlined />, bg: '#EAF0FF', color: '#365CA8' },
            { label: 'Approved in this result', value: summary.approved, icon: <CheckCircleRounded />, bg: '#DDF4E5', color: '#176B3A' },
            { label: 'Need attention', value: summary.attention, icon: <PendingActionsOutlined />, bg: '#FFF4D8', color: '#9A6700' },
          ].map((item) => <Grid key={item.label} size={{ xs: 12, sm: 4 }}><Card variant="outlined"><CardContent sx={{ p: 2.05, '&:last-child': { pb: 2.05 } }}><Stack direction="row" spacing={1.15}><Box sx={{ bgcolor: item.bg, color: item.color, width: 40, height: 40, borderRadius: 2.3, display: 'grid', placeItems: 'center' }}>{item.icon}</Box><Box><Typography variant="h5">{item.value}</Typography><Typography variant="body2" color="text.secondary">{item.label}</Typography></Box></Stack></CardContent></Card></Grid>)}
        </Grid>
        {rows.length ? <Stack spacing={1.7}>{rows.map((application) => <ApplicationCard key={application.id} application={application} canReview={canReview} onHistory={setHistoryApplication} onStatus={openStatus} />)}</Stack> : <EmptyState title="No applications found" description="Try changing the search or filters, or recommend an eligible scheme from a family profile." actionLabel="Clear filters" onAction={resetFilters} />}
        {meta && meta.totalPages > 1 && <Stack alignItems="center" sx={{ mt: 2.5 }}><Pagination page={page} count={meta.totalPages} onChange={(_, value) => setPage(value)} color="primary" /></Stack>}
      </>}

      <Dialog open={Boolean(historyApplication)} onClose={() => setHistoryApplication(null)} fullWidth maxWidth="sm">
        <DialogTitle>Application history</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary">{historyApplication?.applicationNumber} · {historyApplication?.scheme.name}</Typography>
          {historyQuery.isLoading && <Typography sx={{ py: 3 }}>Loading history…</Typography>}
          {historyQuery.isError && <Alert severity="error" sx={{ mt: 2 }}>{historyQuery.error instanceof Error ? historyQuery.error.message : 'History could not be loaded.'}</Alert>}
          {!historyQuery.isLoading && !historyQuery.isError && <Stack spacing={1.45} sx={{ mt: 2 }}>{[...(historyQuery.data?.statuses ?? []), ...(historyQuery.data?.workflow ?? [])].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()).map((event) => <Stack key={event.id} direction="row" spacing={1.2}><Box sx={{ mt: .35, width: 10, height: 10, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} /><Box><Typography variant="body2" fontWeight={800}>{'status' in event ? titleCase(event.status) : event.title}</Typography><Typography variant="caption" color="text.secondary">{dateLabel(event.createdAt, true)}</Typography>{event.note && <Typography variant="body2" sx={{ mt: .2 }}>{event.note}</Typography>}</Box></Stack>)}{!(historyQuery.data?.statuses.length || historyQuery.data?.workflow.length) && <EmptyState title="No history recorded" description="The first status update will appear here." />}</Stack>}
        </DialogContent>
        <DialogActions><Button onClick={() => setHistoryApplication(null)}>Close</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(statusApplication)} onClose={() => setStatusApplication(null)} fullWidth maxWidth="xs">
        <DialogTitle>Update application status</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{statusApplication?.applicationNumber} · {statusApplication?.scheme.name}</Typography>
          <FormControl fullWidth><InputLabel>Next status</InputLabel><Select value={nextStatus} label="Next status" onChange={(event) => setNextStatus(event.target.value as ApplicationStatus)}>{statusApplication && transitions[statusApplication.status].map((item) => <MenuItem value={item} key={item}>{titleCase(item)}</MenuItem>)}</Select></FormControl>
          <TextField fullWidth multiline minRows={3} sx={{ mt: 2 }} label={nextStatus === 'REJECTED' ? 'Rejection reason' : 'Decision note (optional)'} value={statusNote} onChange={(event) => setStatusNote(event.target.value)} />
          {statusMutation.isError && <Alert severity="error" sx={{ mt: 1.5 }}>{statusMutation.error instanceof Error ? statusMutation.error.message : 'The status could not be updated.'}</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => setStatusApplication(null)}>Cancel</Button><Button variant="contained" disabled={!statusApplication || !nextStatus || statusMutation.isPending || (nextStatus === 'REJECTED' && !statusNote.trim())} onClick={() => statusApplication && statusMutation.mutate({ id: statusApplication.id, status: nextStatus as ApplicationStatus, note: nextStatus === 'REJECTED' ? undefined : statusNote || undefined, rejectionReason: nextStatus === 'REJECTED' ? statusNote.trim() : undefined })}>Save status</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
