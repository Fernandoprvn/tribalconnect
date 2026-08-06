import { Add, FilterListOutlined, Search, VisibilityOutlined } from '@mui/icons-material';
import { Avatar, Box, Button, Card, CardContent, Chip, FormControl, Grid, InputAdornment, InputLabel, MenuItem, Pagination, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, alpha, useTheme } from '@mui/material';
import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { EmptyState, ErrorState, PageSkeleton } from '../components/AsyncState';
import { primaryApi, titleCase, type FamilyStatus } from '../lib/primaryRecords';

const statuses: FamilyStatus[] = ['DRAFT', 'SUBMITTED', 'DOCUMENT_VERIFICATION', 'FIELD_VISIT', 'APPROVED', 'REJECTED'];

function FamilyStatusChip({ status }: { status: FamilyStatus }) {
  const color = status === 'APPROVED' ? 'success' : status === 'REJECTED' ? 'error' : status === 'DRAFT' ? 'default' : status === 'FIELD_VISIT' ? 'info' : 'warning';
  return <Chip label={titleCase(status)} color={color} size="small" variant={status === 'APPROVED' ? 'filled' : 'outlined'} />;
}

export default function FamiliesPage() {
  const theme = useTheme();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<FamilyStatus | ''>('');
  const [districtId, setDistrictId] = useState('');
  const [villageId, setVillageId] = useState('');
  const [page, setPage] = useState(1);
  const districtsQuery = useQuery({ queryKey: ['geography', 'districts'], queryFn: primaryApi.geography.districts, staleTime: 5 * 60_000 });
  const villagesQuery = useQuery({ queryKey: ['geography', 'villages', districtId], queryFn: () => primaryApi.villages.list({ districtId, limit: 100 }), enabled: Boolean(districtId), staleTime: 60_000 });
  const familiesQuery = useQuery({
    queryKey: ['families', { page, search: deferredSearch, status, districtId, villageId }],
    queryFn: () => primaryApi.families.list({ page, limit: 12, search: deferredSearch, status: status ? [status] : undefined, districtId: districtId || undefined, villageId: villageId || undefined }),
    placeholderData: (previous) => previous,
  });
  const families = familiesQuery.data?.data ?? [];
  const meta = familiesQuery.data?.meta;
  const reset = () => { setSearch(''); setStatus(''); setDistrictId(''); setVillageId(''); setPage(1); };
  const changeDistrict = (value: string) => { setDistrictId(value); setVillageId(''); setPage(1); };

  return (
    <Box>
      <PageHeader title="Families" eyebrow="Beneficiary registry" description="Search, verify and follow the welfare journey of every registered household." action={<Button component={Link} to="/onboarding" variant="contained" startIcon={<Add />}>Register family</Button>} />
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2.25, borderRadius: 3 }}>
        <Grid container spacing={1.25} alignItems="center">
          <Grid size={{ xs: 12, md: 4 }}><TextField value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, mobile, Aadhaar or family code" fullWidth size="small" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><FormControl fullWidth size="small"><InputLabel>Status</InputLabel><Select value={status} onChange={(event) => { setStatus(event.target.value as FamilyStatus | ''); setPage(1); }} label="Status"><MenuItem value="">All statuses</MenuItem>{statuses.map((item) => <MenuItem key={item} value={item}>{titleCase(item)}</MenuItem>)}</Select></FormControl></Grid>
          <Grid size={{ xs: 6, md: 2.25 }}><FormControl fullWidth size="small"><InputLabel>District</InputLabel><Select value={districtId} onChange={(event) => changeDistrict(event.target.value)} label="District"><MenuItem value="">All districts</MenuItem>{(districtsQuery.data ?? []).map((district) => <MenuItem key={district.id} value={district.id}>{district.name}</MenuItem>)}</Select></FormControl></Grid>
          <Grid size={{ xs: 8, md: 2.25 }}><FormControl fullWidth size="small" disabled={!districtId || villagesQuery.isLoading}><InputLabel>Village</InputLabel><Select value={villageId} onChange={(event) => { setVillageId(event.target.value); setPage(1); }} label="Village"><MenuItem value="">All villages</MenuItem>{(villagesQuery.data?.data ?? []).map((village) => <MenuItem key={village.id} value={village.id}>{village.name}</MenuItem>)}</Select></FormControl></Grid>
          <Grid size={{ xs: 4, md: 1.5 }}><Button fullWidth variant="outlined" startIcon={<FilterListOutlined />} onClick={reset}>Reset</Button></Grid>
        </Grid>
      </Paper>

      {familiesQuery.isLoading ? <PageSkeleton rows={6} /> : familiesQuery.isError ? <ErrorState description={familiesQuery.error instanceof Error ? familiesQuery.error.message : 'Family records could not be loaded.'} onRetry={() => void familiesQuery.refetch()} /> : <>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1} sx={{ mb: 1.5 }}><Typography variant="body2" color="text.secondary"><strong>{meta?.total ?? 0}</strong> families found · Aadhaar is masked for privacy</Typography>{familiesQuery.isFetching && <Typography variant="caption" color="text.secondary">Refreshing…</Typography>}</Stack>
        {families.length === 0 ? <EmptyState title="No matching families" description="Try changing your search or clearing a filter." actionLabel="Clear filters" onAction={reset} /> : <>
          <TableContainer component={Paper} variant="outlined" sx={{ display: { xs: 'none', md: 'block' }, borderRadius: 3 }}>
            <Table aria-label="Registered families"><TableHead><TableRow><TableCell>Family head</TableCell><TableCell>Village</TableCell><TableCell>Household</TableCell><TableCell>Profile status</TableCell><TableCell>Updated</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead><TableBody>{families.map((family) => <TableRow key={family.id} hover><TableCell><Stack direction="row" spacing={1.2} alignItems="center"><Avatar sx={{ width: 34, height: 34, bgcolor: alpha(theme.palette.primary.main, .13), color: 'primary.main', fontSize: '.75rem', fontWeight: 800 }}>{family.headName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Avatar><Box><Typography variant="body2" fontWeight={800}>{family.headName}</Typography><Typography variant="caption" color="text.secondary">{family.mobile} · {family.aadhaarMasked}</Typography></Box></Stack></TableCell><TableCell><Typography variant="body2" fontWeight={700}>{family.village?.name ?? 'Not recorded'}</Typography><Typography variant="caption" color="text.secondary">{family.district?.name ?? 'District unavailable'}</Typography></TableCell><TableCell><Typography variant="body2">{family._count?.members ?? 0} members</Typography><Typography variant="caption" color="text.secondary">{family.tribalCommunity}</Typography></TableCell><TableCell><FamilyStatusChip status={family.status} /></TableCell><TableCell><Typography variant="body2">{new Date(family.updatedAt).toLocaleDateString('en-IN')}</Typography><Typography variant="caption" color="text.secondary">{family.familyCode}</Typography></TableCell><TableCell align="right"><Button component={Link} to={`/families/${family.id}`} size="small" startIcon={<VisibilityOutlined />}>Open</Button></TableCell></TableRow>)}</TableBody></Table>
          </TableContainer>
          <Stack spacing={1.35} sx={{ display: { xs: 'flex', md: 'none' } }}>{families.map((family) => <Card key={family.id} variant="outlined"><CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}><Stack direction="row" spacing={1.2}><Avatar sx={{ bgcolor: alpha(theme.palette.primary.main, .13), color: 'primary.main', fontSize: '.75rem', fontWeight: 800 }}>{family.headName.split(' ').map((part) => part[0]).join('').slice(0, 2)}</Avatar><Box sx={{ minWidth: 0, flex: 1 }}><Stack direction="row" justifyContent="space-between" spacing={1}><Typography fontWeight={800} noWrap>{family.headName}</Typography><FamilyStatusChip status={family.status} /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>{family.village?.name ?? 'Village unavailable'} · {family._count?.members ?? 0} members · {family.tribalCommunity}</Typography><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.4 }}><Typography variant="caption" color="text.secondary">{family.familyCode}</Typography><Button component={Link} to={`/families/${family.id}`} size="small">View profile</Button></Stack></Box></Stack></CardContent></Card>)}</Stack>
          {(meta?.totalPages ?? 1) > 1 && <Stack alignItems="center" sx={{ mt: 2.4 }}><Pagination count={meta?.totalPages ?? 1} page={page} onChange={(_, next) => setPage(next)} color="primary" /></Stack>}
        </>}
      </>}
    </Box>
  );
}
