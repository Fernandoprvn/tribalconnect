import { Add, ArrowForward, AssignmentTurnedInOutlined, CalendarMonthOutlined, DownloadOutlined, FactCheckOutlined, GroupsOutlined, LocationCityOutlined, MoreHoriz, PendingActionsOutlined, TrendingUpOutlined, VolunteerActivismOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, FormControl, Grid, IconButton, InputLabel, LinearProgress, MenuItem, Paper, Select, Skeleton, Stack, Typography, alpha, useTheme } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { StatusChip } from '../components/StatusChip';
import { dashboardApi, type DashboardFilters } from '../lib/operations';
import type { RootState } from '../store';
import type { WorkflowStatus } from '../types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend);

type DateRange = '30d' | 'quarter' | 'year';
type FilterKey = 'districtId' | 'villageId' | 'officerId' | 'schemeId';

const formatNumber = (value: number) => new Intl.NumberFormat('en-IN').format(value);

function toDateInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function datesForRange(range: DateRange): Pick<DashboardFilters, 'dateFrom' | 'dateTo'> {
  const end = new Date();
  let start = new Date(end);
  if (range === '30d') start.setDate(start.getDate() - 29);
  if (range === 'quarter') start = new Date(end.getFullYear(), Math.floor(end.getMonth() / 3) * 3, 1);
  if (range === 'year') start = new Date(end.getFullYear(), 0, 1);
  return { dateFrom: toDateInput(start), dateTo: toDateInput(end) };
}

function toWorkflowStatus(value?: string): WorkflowStatus {
  switch (value?.toUpperCase().replaceAll('-', '_').replaceAll(' ', '_')) {
    case 'DOCUMENT_VERIFICATION':
    case 'VERIFICATION':
      return 'Verification';
    case 'FIELD_VISIT':
      return 'Field visit';
    case 'APPROVED':
      return 'Approved';
    case 'APPLICATION_SUBMITTED':
    case 'SUBMITTED':
      return 'Submitted';
    case 'UNDER_REVIEW':
    case 'RECOMMENDED':
    case 'APPLIED':
      return 'Applied';
    case 'BENEFIT_RECEIVED':
      return 'Benefit received';
    case 'REJECTED':
      return 'Rejected';
    default:
      return 'Submitted';
  }
}

function EmptyChart({ message }: { message: string }) {
  return <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', px: 3 }}><Typography variant="body2" color="text.secondary">{message}</Typography></Box>;
}

export default function DashboardPage() {
  const theme = useTheme();
  const session = useSelector((state: RootState) => state.session);
  const mutedGrid = alpha(theme.palette.text.primary, .08);
  const [selectedRange, setSelectedRange] = useState<DateRange>('30d');
  const [filters, setFilters] = useState<DashboardFilters>({});
  const apiFilters = useMemo(() => ({ ...filters, ...datesForRange(selectedRange) }), [filters, selectedRange]);
  const dashboardQuery = useQuery({
    queryKey: ['dashboard', apiFilters],
    queryFn: () => dashboardApi.get(apiFilters),
  });
  const dashboardFiltersQuery = useQuery({ queryKey: ['dashboard-filter-options'], queryFn: dashboardApi.filters, staleTime: 5 * 60_000 });
  const dashboard = dashboardQuery.data;
  const filterOptions = dashboardFiltersQuery.data ?? { districts: [], villages: [], officers: [], schemes: [] };
  const kpis = dashboard?.kpis;
  const outcomes = dashboard?.charts.applicationOutcomes ?? { approved: 0, inProgress: 0, pendingDocuments: 0, rejected: 0 };
  const outcomeItems = [
    { label: 'Approved', color: '#0B6E4F', value: outcomes.approved },
    { label: 'In progress', color: '#F4B400', value: outcomes.inProgress },
    { label: 'Pending documents', color: '#6D8FA1', value: outcomes.pendingDocuments },
    { label: 'Rejected', color: '#D9746A', value: outcomes.rejected },
  ];
  const outcomeTotal = outcomeItems.reduce((total, item) => total + item.value, 0);
  const approvalRate = outcomeTotal ? Math.round((outcomes.approved / outcomeTotal) * 1000) / 10 : 0;
  const hasDashboardData = Boolean(dashboard && (
    Object.values(dashboard.kpis).some((metric) => metric.value > 0)
    || dashboard.charts.registrations.length > 0
    || dashboard.charts.villageCoverage.length > 0
    || dashboard.attention.length > 0
  ));

  const updateFilter = (key: FilterKey, value: string) => {
    setFilters((current) => {
      const next: DashboardFilters = { ...current, [key]: value || undefined };
      if (key === 'districtId') next.villageId = undefined;
      return next;
    });
  };

  const resetFilters = () => {
    setFilters({});
    setSelectedRange('30d');
  };

  const cards = kpis ? [
    { label: 'Total families', metric: kpis.totalFamilies, icon: <GroupsOutlined />, color: '#0B6E4F' },
    { label: 'Verified profiles', metric: kpis.verifiedFamilies, icon: <FactCheckOutlined />, color: '#1F7A8C' },
    { label: 'Pending verification', metric: kpis.pendingVerification, icon: <PendingActionsOutlined />, color: '#D97706' },
    { label: 'Approved applications', metric: kpis.approvedApplications, icon: <AssignmentTurnedInOutlined />, color: '#6D4FC2' },
  ] : [];
  const registrationData = {
    labels: dashboard?.charts.registrations.map((point) => point.label) ?? [],
    datasets: [{
      label: 'Families registered',
      data: dashboard?.charts.registrations.map((point) => point.value) ?? [],
      borderColor: '#0B6E4F',
      backgroundColor: (context: { chart: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }) => {
        const { ctx, chartArea } = context.chart;
        if (!chartArea) return 'rgba(11,110,79,.12)';
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, 'rgba(11,110,79,.28)');
        gradient.addColorStop(1, 'rgba(11,110,79,0)');
        return gradient;
      },
      fill: true,
      tension: .42,
      pointRadius: 0,
      pointHoverRadius: 4,
      borderWidth: 3,
    }],
  };
  const barData = {
    labels: dashboard?.charts.villageCoverage.map((point) => point.label) ?? [],
    datasets: [{
      label: 'Verified families',
      data: dashboard?.charts.villageCoverage.map((point) => point.value) ?? [],
      backgroundColor: ['#0B6E4F', '#2E8B57', '#5A9E75', '#8BC3A1', '#C2E4CF'],
      borderRadius: 7,
      borderSkipped: false,
      barThickness: 18,
    }],
  };
  const doughnutData = {
    labels: outcomeItems.map((item) => item.label),
    datasets: [{ data: outcomeItems.map((item) => item.value), backgroundColor: outcomeItems.map((item) => item.color), borderWidth: 0, hoverOffset: 4 }],
  };
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#173229', padding: 10, titleFont: { family: 'Inter' }, bodyFont: { family: 'Inter' }, displayColors: false },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { color: theme.palette.text.secondary, font: { size: 11 } } },
      y: { beginAtZero: true, grid: { color: mutedGrid }, border: { display: false }, ticks: { color: theme.palette.text.secondary, font: { size: 11 }, maxTicksLimit: 5 } },
    },
  };

  return (
    <Box>
      <PageHeader
        title={`Good morning${session.name ? `, ${session.name.split(' ')[0]}` : ''}`}
        description="Here is how welfare delivery is moving across your assigned villages."
        eyebrow="District workspace"
        action={<Stack direction="row" spacing={1}><Button component={Link} to="/reports" variant="outlined" startIcon={<DownloadOutlined />} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Export</Button><Button component={Link} to="/onboarding" variant="contained" startIcon={<Add />}>Register family</Button></Stack>}
      />
      <Paper variant="outlined" sx={{ p: { xs: 1.4, sm: 1.8 }, mb: 3, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.3} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={.8} alignItems="center" sx={{ color: 'text.secondary', minWidth: 118 }}><CalendarMonthOutlined fontSize="small" /><Typography variant="body2" fontWeight={800}>View data for</Typography></Stack>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.1} sx={{ flex: 1, flexWrap: 'wrap', rowGap: 1.1 }}>
            <FormControl size="small" sx={{ minWidth: 145 }}><InputLabel>District</InputLabel><Select value={filters.districtId ?? ''} onChange={(event) => updateFilter('districtId', event.target.value)} label="District"><MenuItem value="">All districts</MenuItem>{filterOptions.districts.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 145 }} disabled={dashboardQuery.isLoading && !dashboard}><InputLabel>Village</InputLabel><Select value={filters.villageId ?? ''} onChange={(event) => updateFilter('villageId', event.target.value)} label="Village"><MenuItem value="">All villages</MenuItem>{filterOptions.villages.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 155 }}><InputLabel>Officer</InputLabel><Select value={filters.officerId ?? ''} onChange={(event) => updateFilter('officerId', event.target.value)} label="Officer"><MenuItem value="">All officers</MenuItem>{filterOptions.officers.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 155 }}><InputLabel>Scheme</InputLabel><Select value={filters.schemeId ?? ''} onChange={(event) => updateFilter('schemeId', event.target.value)} label="Scheme"><MenuItem value="">All schemes</MenuItem>{filterOptions.schemes.map((option) => <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>)}</Select></FormControl>
            <FormControl size="small" sx={{ minWidth: 165 }}><InputLabel>Date range</InputLabel><Select value={selectedRange} onChange={(event) => setSelectedRange(event.target.value as DateRange)} label="Date range"><MenuItem value="30d">Last 30 days</MenuItem><MenuItem value="quarter">This quarter</MenuItem><MenuItem value="year">This year</MenuItem></Select></FormControl>
          </Stack>
          <Button size="small" onClick={resetFilters}>Reset filters</Button>
        </Stack>
      </Paper>
      {dashboardQuery.isError && <Alert severity="error" sx={{ mb: 2.2 }} action={<Button color="inherit" size="small" onClick={() => void dashboardQuery.refetch()}>Retry</Button>}>The dashboard could not be loaded. Check the connection and try again.</Alert>}
      {dashboardQuery.isLoading && !dashboard && <Grid container spacing={2.2}>{Array.from({ length: 4 }, (_, index) => <Grid key={index} size={{ xs: 12, sm: 6, xl: 3 }}><Card variant="outlined"><CardContent><Skeleton width="55%" /><Skeleton variant="text" width="38%" height={56} /><Skeleton width="70%" /></CardContent></Card></Grid>)}</Grid>}
      {!dashboardQuery.isLoading && dashboard && !hasDashboardData && <Paper variant="outlined" sx={{ py: 7, px: 3, textAlign: 'center', mb: 2.3 }}><GroupsOutlined color="disabled" sx={{ fontSize: 40 }} /><Typography variant="h6" sx={{ mt: 1 }}>No dashboard data for this scope</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Try widening the filters or register a family to begin tracking delivery.</Typography></Paper>}
      {dashboard && kpis && hasDashboardData && <>
        <Grid container spacing={2.2}>{cards.map((card) => <Grid key={card.label} size={{ xs: 12, sm: 6, xl: 3 }}><StatCard label={card.label} value={formatNumber(card.metric.value)} icon={card.icon} color={card.color} change={card.metric.change} helper={card.metric.helper} direction={card.metric.direction} /></Grid>)}</Grid>
        <Grid container spacing={2.3} sx={{ mt: .1 }}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Card variant="outlined" sx={{ height: '100%' }}><CardContent sx={{ p: { xs: 2, sm: 2.6 }, '&:last-child': { pb: { xs: 2, sm: 2.6 } } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Typography variant="h6">Monthly registrations</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .3 }}>Families brought into the portal during the selected period</Typography></Box>{kpis.totalFamilies.change && <Chip icon={<TrendingUpOutlined sx={{ fontSize: '17px !important' }} />} label={kpis.totalFamilies.change} size="small" sx={{ bgcolor: '#DDF4E5', color: '#176B3A' }} />}</Stack>
              <Box sx={{ height: 290, mt: 2.6 }}>{dashboard.charts.registrations.length ? <Line data={registrationData} options={chartOptions} /> : <EmptyChart message="Registration activity will appear here when records match the selected filters." />}</Box>
            </CardContent></Card>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Card variant="outlined" sx={{ height: '100%' }}><CardContent sx={{ p: { xs: 2, sm: 2.6 }, '&:last-child': { pb: { xs: 2, sm: 2.6 } } }}><Typography variant="h6">Application outcomes</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .3 }}>Across the selected schemes and period</Typography><Box sx={{ height: 210, mt: 1.8, position: 'relative' }}>{outcomeTotal ? <><Doughnut data={doughnutData} options={{ responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { backgroundColor: '#173229', displayColors: false } } }} /><Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}><Box textAlign="center"><Typography variant="h5">{approvalRate}%</Typography><Typography variant="caption" color="text.secondary">approved</Typography></Box></Box></> : <EmptyChart message="No application outcomes are available yet." />}</Box><Stack spacing={.75} sx={{ mt: 1 }}>{outcomeItems.map((item) => <Stack key={item.label} direction="row" justifyContent="space-between"><Stack direction="row" spacing={.8} alignItems="center"><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color }} /><Typography variant="caption" color="text.secondary">{item.label}</Typography></Stack><Typography variant="caption" fontWeight={800}>{formatNumber(item.value)}</Typography></Stack>)}</Stack></CardContent></Card>
          </Grid>
          <Grid size={{ xs: 12, lg: 5 }}>
            <Card variant="outlined" sx={{ height: '100%' }}><CardContent sx={{ p: { xs: 2, sm: 2.6 }, '&:last-child': { pb: { xs: 2, sm: 2.6 } } }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6">Village-wise coverage</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .3 }}>Registered family profiles by village</Typography></Box><IconButton size="small" component={Link} to="/villages" aria-label="Open village map"><MoreHoriz /></IconButton></Stack><Box sx={{ height: 255, mt: 2 }}>{dashboard.charts.villageCoverage.length ? <Bar data={barData} options={{ ...chartOptions, indexAxis: 'y' as const, scales: { x: { ...chartOptions.scales.x, grid: { color: mutedGrid }, ticks: { color: theme.palette.text.secondary, font: { size: 11 }, maxTicksLimit: 4 } }, y: { ...chartOptions.scales.y, grid: { display: false }, ticks: { color: theme.palette.text.secondary, font: { size: 11 } } } } }} /> : <EmptyChart message="Village coverage will appear when matching profiles are available." />}</Box></CardContent></Card>
          </Grid>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Card variant="outlined" sx={{ height: '100%' }}><CardContent sx={{ p: { xs: 2, sm: 2.6 }, '&:last-child': { pb: { xs: 2, sm: 2.6 } } }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6">Attention needed</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .3 }}>The next actions to keep applications moving</Typography></Box><Button component={Link} to="/applications" size="small" endIcon={<ArrowForward />}>View all</Button></Stack>{dashboard.attention.length ? <Stack spacing={0} divider={<Divider flexItem />} sx={{ mt: 1.4 }}>{dashboard.attention.slice(0, 4).map((item) => <Stack key={item.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.2} sx={{ py: 1.5 }}><Stack direction="row" alignItems="center" spacing={1.2}><Box sx={{ width: 36, height: 36, display: 'grid', placeItems: 'center', borderRadius: 2, bgcolor: alpha(theme.palette.primary.main, .1), color: 'primary.main' }}>{item.kind?.toLowerCase().includes('visit') ? <VolunteerActivismOutlined fontSize="small" /> : <PendingActionsOutlined fontSize="small" />}</Box><Box><Typography variant="body2" fontWeight={800}>{item.title}</Typography><Typography variant="caption" color="text.secondary">{item.subtitle ?? 'Action required'}</Typography></Box></Stack><Stack direction="row" spacing={1.4} alignItems="center"><StatusChip status={toWorkflowStatus(item.status)} /><Button component={Link} to={item.href ?? '/applications'} size="small">Open</Button></Stack></Stack>)}</Stack> : <Typography variant="body2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>No pending actions in the selected scope.</Typography>}</CardContent></Card>
          </Grid>
        </Grid>
        <Grid container spacing={2.2} sx={{ mt: .1 }}>
          <Grid size={{ xs: 12, sm: 4 }}><StatCard label="Active schemes" value={formatNumber(kpis.activeSchemes.value || filterOptions.schemes.length)} icon={<AssignmentTurnedInOutlined />} color="#6D4FC2" change={kpis.activeSchemes.change} helper={kpis.activeSchemes.helper} direction={kpis.activeSchemes.direction} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><StatCard label="Villages covered" value={formatNumber(kpis.villagesCovered.value)} icon={<LocationCityOutlined />} color="#1F7A8C" change={kpis.villagesCovered.change} helper={kpis.villagesCovered.helper} direction={kpis.villagesCovered.direction} /></Grid>
          <Grid size={{ xs: 12, sm: 4 }}><StatCard label="Field visits completed" value={formatNumber(kpis.fieldVisits.value)} icon={<VolunteerActivismOutlined />} color="#D97706" change={kpis.fieldVisits.change} helper={kpis.fieldVisits.helper} direction={kpis.fieldVisits.direction} /></Grid>
        </Grid>
        {dashboard.target && <Card variant="outlined" sx={{ mt: 2.3 }}><CardContent sx={{ p: { xs: 2, sm: 2.6 }, '&:last-child': { pb: { xs: 2, sm: 2.6 } } }}><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" spacing={1.4}><Box><Typography variant="h6">{dashboard.target.label ?? 'District delivery target'}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .3 }}>Progress for the selected dashboard scope.</Typography></Box><Typography variant="h5" color="primary.main">{formatNumber(dashboard.target.current)} / {formatNumber(dashboard.target.target)}</Typography></Stack><LinearProgress variant="determinate" value={Math.min(100, (dashboard.target.current / dashboard.target.target) * 100)} sx={{ mt: 2, height: 10, borderRadius: 99, bgcolor: alpha(theme.palette.primary.main, .1), '& .MuiLinearProgress-bar': { borderRadius: 99 } }} /></CardContent></Card>}
      </>}
    </Box>
  );
}
