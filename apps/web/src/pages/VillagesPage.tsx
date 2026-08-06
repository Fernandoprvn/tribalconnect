import { AddLocationAltOutlined, AssignmentOutlined, DeleteOutline, EditOutlined, GroupsOutlined, LayersOutlined, LocationOnOutlined, MapOutlined, PersonAddAltOutlined, PersonOutlined, Search, WarningAmberOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControl, Grid, IconButton, InputAdornment, InputLabel, LinearProgress, List, ListItemButton, ListItemIcon, ListItemText, MenuItem, Pagination, Paper, Select, Stack, TextField, Tooltip, Typography, alpha, useTheme } from '@mui/material';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import { EmptyState, ErrorState, PageSkeleton } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import type { RootState } from '../store';
import { numberValue, primaryApi, type PrimaryVillage, type VillageInput } from '../lib/primaryRecords';
import 'leaflet/dist/leaflet.css';

const pageSize = 12;
const fallbackCenter: [number, number] = [10.405, 76.93];

type VillageForm = {
  name: string;
  hamlet: string;
  population: string;
  tribalFamilyCount: string;
  mapLatitude: string;
  mapLongitude: string;
  districtId: string;
  blockId: string;
  panchayatId: string;
};

const newVillageForm = (): VillageForm => ({ name: '', hamlet: '', population: '0', tribalFamilyCount: '0', mapLatitude: '', mapLongitude: '', districtId: '', blockId: '', panchayatId: '' });

function villageFormFor(village: PrimaryVillage): VillageForm {
  return {
    name: village.name,
    hamlet: village.hamlet ?? '',
    population: String(village.population),
    tribalFamilyCount: String(village.tribalFamilyCount),
    mapLatitude: village.mapLatitude == null ? '' : String(village.mapLatitude),
    mapLongitude: village.mapLongitude == null ? '' : String(village.mapLongitude),
    districtId: village.districtId,
    blockId: village.block?.id ?? '',
    panchayatId: village.panchayat?.id ?? '',
  };
}

function coverage(village: PrimaryVillage) {
  const target = Math.max(0, numberValue(village.tribalFamilyCount));
  if (!target) return 0;
  return Math.min(100, Math.round((numberValue(village.statistics?.familyCount) / target) * 100));
}

function coverageColor(value: number) {
  return value >= 90 ? '#0B6E4F' : value >= 75 ? '#E6A700' : '#D9746A';
}

function MapViewport({ villages, activeId }: { villages: PrimaryVillage[]; activeId: string | null }) {
  const map = useMap();
  useEffect(() => {
    const selected = villages.find((village) => village.id === activeId);
    const latitude = numberValue(selected?.mapLatitude, NaN);
    const longitude = numberValue(selected?.mapLongitude, NaN);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      map.setView([latitude, longitude], Math.max(map.getZoom(), 12));
      return;
    }
    const points = villages.map((village) => [numberValue(village.mapLatitude, NaN), numberValue(village.mapLongitude, NaN)] as [number, number]).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
    if (points.length > 1) map.fitBounds(points, { padding: [32, 32], maxZoom: 12 });
  }, [activeId, map, villages]);
  return null;
}

/** Dependency-free grid clustering keeps marker density usable without adding a map plugin. */
function VillageMarkers({ villages, activeId, onSelect }: { villages: PrimaryVillage[]; activeId: string | null; onSelect: (id: string) => void }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    const updateZoom = () => setZoom(map.getZoom());
    map.on('zoomend', updateZoom);
    return () => { map.off('zoomend', updateZoom); };
  }, [map]);
  const clusters = useMemo(() => {
    const cell = zoom < 8 ? 2 : zoom < 10 ? .45 : zoom < 12 ? .1 : .025;
    const grouped = new Map<string, PrimaryVillage[]>();
    villages.forEach((village) => {
      const latitude = numberValue(village.mapLatitude, NaN);
      const longitude = numberValue(village.mapLongitude, NaN);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
      const key = `${Math.round(latitude / cell)}:${Math.round(longitude / cell)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), village]);
    });
    return [...grouped.values()].map((group) => ({
      villages: group,
      latitude: group.reduce((total, village) => total + numberValue(village.mapLatitude), 0) / group.length,
      longitude: group.reduce((total, village) => total + numberValue(village.mapLongitude), 0) / group.length,
    }));
  }, [villages, zoom]);
  return <>{clusters.map((cluster) => {
    const representative = cluster.villages[0];
    const count = cluster.villages.length;
    const isActive = cluster.villages.some((village) => village.id === activeId);
    const value = coverage(representative);
    return <CircleMarker key={cluster.villages.map((village) => village.id).join('-')} center={[cluster.latitude, cluster.longitude]} radius={count > 1 ? Math.min(21, 10 + count * 2) : isActive ? 13 : 10} pathOptions={{ color: '#fff', weight: 3, fillColor: count > 1 ? '#365CA8' : coverageColor(value), fillOpacity: 1 }} eventHandlers={{ click: () => onSelect(representative.id) }}>
      <Popup>
        {count === 1 ? <Box sx={{ minWidth: 170 }}><Typography fontWeight={800}>{representative.name}</Typography><Typography variant="body2">{representative.tribalFamilyCount} tribal families</Typography><Typography variant="body2">{representative.statistics.pendingFamilies} pending cases</Typography><Button size="small" sx={{ mt: .4 }} onClick={() => onSelect(representative.id)}>Open details</Button></Box> : <Box sx={{ minWidth: 190 }}><Typography fontWeight={800}>{count} villages clustered</Typography><Typography variant="body2" sx={{ mb: .55 }}>Zoom in to separate markers, or select a village.</Typography>{cluster.villages.slice(0, 5).map((village) => <Button key={village.id} size="small" fullWidth sx={{ justifyContent: 'flex-start' }} onClick={() => onSelect(village.id)}>{village.name}</Button>)}</Box>}
      </Popup>
    </CircleMarker>;
  })}</>;
}

function VillageEditor({ open, village, form, districts, blocks, panchayats, pending, error, onClose, onChange, onSubmit }: { open: boolean; village: PrimaryVillage | null; form: VillageForm; districts: Array<{ id: string; name: string }>; blocks: Array<{ id: string; name: string }>; panchayats: Array<{ id: string; name: string }>; pending: boolean; error: string | null; onClose: () => void; onChange: (field: keyof VillageForm, value: string) => void; onSubmit: () => void }) {
  return <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>{village ? 'Edit village' : 'Add village'}</DialogTitle>
    <DialogContent dividers><Grid container spacing={1.5} sx={{ pt: .3 }}>
      <Grid size={{ xs: 12, sm: 7 }}><TextField fullWidth required label="Village name" value={form.name} onChange={(event) => onChange('name', event.target.value)} /></Grid>
      <Grid size={{ xs: 12, sm: 5 }}><TextField fullWidth label="Hamlet" value={form.hamlet} onChange={(event) => onChange('hamlet', event.target.value)} /></Grid>
      <Grid size={12}><FormControl fullWidth required><InputLabel>District</InputLabel><Select value={form.districtId} label="District" onChange={(event) => onChange('districtId', event.target.value)}>{districts.map((district) => <MenuItem key={district.id} value={district.id}>{district.name}</MenuItem>)}</Select></FormControl></Grid>
      <Grid size={{ xs: 12, sm: 6 }}><FormControl fullWidth><InputLabel>Block</InputLabel><Select value={form.blockId} label="Block" onChange={(event) => onChange('blockId', event.target.value)}><MenuItem value="">Not assigned</MenuItem>{blocks.map((block) => <MenuItem key={block.id} value={block.id}>{block.name}</MenuItem>)}</Select></FormControl></Grid>
      <Grid size={{ xs: 12, sm: 6 }}><FormControl fullWidth><InputLabel>Panchayat</InputLabel><Select value={form.panchayatId} label="Panchayat" onChange={(event) => onChange('panchayatId', event.target.value)}><MenuItem value="">Not assigned</MenuItem>{panchayats.map((panchayat) => <MenuItem key={panchayat.id} value={panchayat.id}>{panchayat.name}</MenuItem>)}</Select></FormControl></Grid>
      <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required type="number" inputProps={{ min: 0, step: 1 }} label="Population" value={form.population} onChange={(event) => onChange('population', event.target.value)} /></Grid>
      <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required type="number" inputProps={{ min: 0, step: 1 }} label="Target tribal families" value={form.tribalFamilyCount} onChange={(event) => onChange('tribalFamilyCount', event.target.value)} /></Grid>
      <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" inputProps={{ step: 'any' }} label="Map latitude" value={form.mapLatitude} onChange={(event) => onChange('mapLatitude', event.target.value)} /></Grid>
      <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth type="number" inputProps={{ step: 'any' }} label="Map longitude" value={form.mapLongitude} onChange={(event) => onChange('mapLongitude', event.target.value)} /></Grid>
    </Grid>{error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}</DialogContent>
    <DialogActions sx={{ p: 2 }}><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={pending} onClick={onSubmit}>{village ? 'Save changes' : 'Create village'}</Button></DialogActions>
  </Dialog>;
}

export default function VillagesPage() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const session = useSelector((state: RootState) => state.session);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [districtId, setDistrictId] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PrimaryVillage | null>(null);
  const [form, setForm] = useState<VillageForm>(newVillageForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [assignmentVillage, setAssignmentVillage] = useState<PrimaryVillage | null>(null);
  const [assignedOfficerId, setAssignedOfficerId] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState<PrimaryVillage | null>(null);
  const canManage = session.role === 'SUPER_ADMIN' || session.role === 'DEVELOPMENT_OFFICER';
  const isSuperAdmin = session.role === 'SUPER_ADMIN';
  const villagesQuery = useQuery({ queryKey: ['villages', page, deferredSearch, districtId], queryFn: () => primaryApi.villages.list({ page, limit: pageSize, search: deferredSearch || undefined, districtId: districtId || undefined }) });
  const mapQuery = useQuery({ queryKey: ['village-map', districtId], queryFn: () => primaryApi.villages.map(districtId || undefined) });
  const districtsQuery = useQuery({ queryKey: ['geography-districts'], queryFn: () => primaryApi.geography.districts() });
  const blocksQuery = useQuery({ queryKey: ['geography-blocks', form.districtId], queryFn: () => primaryApi.geography.blocks(form.districtId), enabled: Boolean(editorOpen && form.districtId) });
  const panchayatsQuery = useQuery({ queryKey: ['geography-panchayats', form.districtId, form.blockId], queryFn: () => primaryApi.geography.panchayats(form.districtId, form.blockId || undefined), enabled: Boolean(editorOpen && form.districtId) });
  const officersQuery = useQuery({ queryKey: ['district-officers', assignmentVillage?.districtId], queryFn: () => primaryApi.geography.officers(assignmentVillage?.districtId), enabled: Boolean(isSuperAdmin && assignmentVillage) });
  const rows = villagesQuery.data?.data ?? [];
  const mapVillages = mapQuery.data ?? [];
  const selected = rows.find((village) => village.id === activeId) ?? mapVillages.find((village) => village.id === activeId) ?? rows[0] ?? mapVillages[0];
  useEffect(() => {
    if (rows.length && !rows.some((village) => village.id === activeId)) setActiveId(rows[0].id);
    if (!rows.length && !mapVillages.length) setActiveId(null);
  }, [activeId, mapVillages.length, rows]);
  const invalidateVillages = () => {
    void queryClient.invalidateQueries({ queryKey: ['villages'] });
    void queryClient.invalidateQueries({ queryKey: ['village-map'] });
    void queryClient.invalidateQueries({ queryKey: ['geography-villages'] });
  };
  const saveMutation = useMutation({
    mutationFn: (input: { village: PrimaryVillage | null; payload: VillageInput }) => input.village ? primaryApi.villages.update(input.village.id, input.payload) : primaryApi.villages.create(input.payload),
    onSuccess: (village) => { setEditorOpen(false); setEditing(null); setForm(newVillageForm()); setFormError(null); setActiveId(village.id); invalidateVillages(); },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'The village could not be saved.'),
  });
  const assignmentMutation = useMutation({ mutationFn: (input: { villageId: string; officerId: string | null }) => primaryApi.villages.assignOfficer(input.villageId, input.officerId), onSuccess: () => { setAssignmentVillage(null); invalidateVillages(); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => primaryApi.villages.remove(id), onSuccess: () => { setDeleteCandidate(null); invalidateVillages(); } });
  const totalTarget = useMemo(() => mapVillages.reduce((total, village) => total + numberValue(village.tribalFamilyCount), 0), [mapVillages]);
  const totalRegistered = useMemo(() => mapVillages.reduce((total, village) => total + numberValue(village.statistics.familyCount), 0), [mapVillages]);
  const resetFilters = () => { setSearch(''); setDistrictId(''); setPage(1); };
  const openNew = () => { setEditing(null); setForm({ ...newVillageForm(), districtId: districtId || districtsQuery.data?.[0]?.id || '' }); setFormError(null); setEditorOpen(true); };
  const openEdit = (village: PrimaryVillage) => { setEditing(village); setForm(villageFormFor(village)); setFormError(null); setEditorOpen(true); };
  const changeField = (field: keyof VillageForm, value: string) => setForm((current) => ({ ...current, [field]: value, ...(field === 'districtId' ? { blockId: '', panchayatId: '' } : {}), ...(field === 'blockId' ? { panchayatId: '' } : {}) }));
  const submitVillage = () => {
    const population = Number(form.population);
    const tribalFamilyCount = Number(form.tribalFamilyCount);
    const latitude = form.mapLatitude.trim() ? Number(form.mapLatitude) : undefined;
    const longitude = form.mapLongitude.trim() ? Number(form.mapLongitude) : undefined;
    if (!form.name.trim() || !form.districtId) { setFormError('Village name and district are required.'); return; }
    if (!Number.isInteger(population) || population < 0 || !Number.isInteger(tribalFamilyCount) || tribalFamilyCount < 0) { setFormError('Population and target tribal families must be whole numbers of zero or more.'); return; }
    if (latitude === undefined || longitude === undefined) {
      if (latitude !== longitude) { setFormError('Enter both valid latitude and longitude values, or leave both fields blank.'); return; }
    } else if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) { setFormError('Enter both valid latitude and longitude values, or leave both fields blank.'); return; }
    setFormError(null);
    saveMutation.mutate({ village: editing, payload: { name: form.name.trim(), hamlet: form.hamlet.trim() || undefined, population, tribalFamilyCount, mapLatitude: latitude, mapLongitude: longitude, districtId: form.districtId, blockId: form.blockId || undefined, panchayatId: form.panchayatId || undefined } });
  };
  const openAssignment = (village: PrimaryVillage) => { setAssignmentVillage(village); setAssignedOfficerId(village.assignedOfficer?.id ?? ''); };

  if (villagesQuery.isLoading) return <PageSkeleton rows={5} />;
  if (villagesQuery.isError) return <ErrorState title="Villages could not be loaded" description={villagesQuery.error instanceof Error ? villagesQuery.error.message : undefined} onRetry={() => void villagesQuery.refetch()} />;

  return (
    <Box>
      <PageHeader title="Villages & coverage map" eyebrow="Village management" description="Manage village records, officer assignments, and real-time family and scheme coverage." action={canManage ? <Button variant="contained" startIcon={<AddLocationAltOutlined />} onClick={openNew}>Add village</Button> : undefined} />
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, mb: 2.3 }}><Grid container spacing={1.2}><Grid size={{ xs: 12, sm: 6, md: 5 }}><TextField fullWidth size="small" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search villages or hamlets" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} /></Grid><Grid size={{ xs: 8, sm: 4, md: 4 }}><FormControl fullWidth size="small"><InputLabel>District</InputLabel><Select value={districtId} label="District" onChange={(event) => { setDistrictId(event.target.value); setPage(1); }}><MenuItem value="">All districts</MenuItem>{(districtsQuery.data ?? []).map((district) => <MenuItem key={district.id} value={district.id}>{district.name}</MenuItem>)}</Select></FormControl></Grid><Grid size={{ xs: 4, sm: 2, md: 3 }}><Button fullWidth variant="outlined" onClick={resetFilters}>Reset</Button></Grid></Grid></Paper>
      <Grid container spacing={2.25}>
        <Grid size={{ xs: 12, lg: 4 }}><Stack spacing={2.1}><Card variant="outlined"><CardContent sx={{ p: 2.2, '&:last-child': { pb: 2.2 } }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6">Village directory</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>{villagesQuery.data?.meta?.total ?? rows.length} villages in scope</Typography></Box><Chip label={`${rows.length} shown`} size="small" variant="outlined" /></Stack>{rows.length ? <List disablePadding sx={{ mt: 1.5 }}>{rows.map((village) => { const value = coverage(village); return <ListItemButton key={village.id} selected={village.id === activeId} onClick={() => setActiveId(village.id)} sx={{ borderRadius: 2.35, mb: .55, alignItems: 'flex-start', '&.Mui-selected': { bgcolor: alpha(theme.palette.primary.main, .1) }, '&.Mui-selected:hover': { bgcolor: alpha(theme.palette.primary.main, .13) } }}><ListItemIcon sx={{ minWidth: 35, pt: .35, color: village.id === activeId ? 'primary.main' : 'text.secondary' }}><LocationOnOutlined fontSize="small" /></ListItemIcon><ListItemText primary={<Typography fontWeight={800} variant="body2">{village.name}</Typography>} secondary={<Typography variant="caption" color="text.secondary">{village.block?.name ?? village.district.name} · {village.tribalFamilyCount} tribal families</Typography>} /><Chip label={`${value}%`} size="small" sx={{ color: coverageColor(value), borderColor: alpha(coverageColor(value), .45) }} variant="outlined" /></ListItemButton>; })}</List> : <Box sx={{ mt: 2 }}><EmptyState title="No villages found" description="Try a different search or district filter." actionLabel="Clear filters" onAction={resetFilters} /></Box>}</CardContent></Card>{villagesQuery.data?.meta && villagesQuery.data.meta.totalPages > 1 && <Stack alignItems="center"><Pagination page={page} count={villagesQuery.data.meta.totalPages} onChange={(_, value) => setPage(value)} color="primary" /></Stack>}<Card variant="outlined"><CardContent sx={{ p: 2.2, '&:last-child': { pb: 2.2 } }}><Typography variant="h6">Coverage legend</Typography><Stack spacing={1} sx={{ mt: 1.35 }}>{[['High coverage', '#0B6E4F', '90% or above'], ['In progress', '#E6A700', '75–89%'], ['Needs support', '#D9746A', 'Below 75%']].map(([label, color, description]) => <Stack key={label} direction="row" spacing={1} alignItems="center"><Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} /><Typography variant="body2" sx={{ flex: 1 }}>{label}</Typography><Typography variant="caption" color="text.secondary">{description}</Typography></Stack>)}</Stack></CardContent></Card></Stack></Grid>
        <Grid size={{ xs: 12, lg: 8 }}><Card variant="outlined" sx={{ overflow: 'hidden' }}><CardContent sx={{ p: { xs: 1, sm: 1.5 }, '&:last-child': { pb: { xs: 1, sm: 1.5 } } }}><Box sx={{ minHeight: 390, position: 'relative' }}>{mapQuery.isLoading ? <PageSkeleton rows={1} /> : mapQuery.isError ? <ErrorState title="Map data could not be loaded" description={mapQuery.error instanceof Error ? mapQuery.error.message : undefined} onRetry={() => void mapQuery.refetch()} /> : mapVillages.length ? <Box role="region" aria-label="Village coverage map" sx={{ height: '100%' }}><MapContainer center={fallbackCenter} zoom={10} scrollWheelZoom><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><MapViewport villages={mapVillages} activeId={activeId} /><VillageMarkers villages={mapVillages} activeId={activeId} onSelect={setActiveId} /></MapContainer></Box> : <EmptyState title="No village coordinates available" description="Add latitude and longitude to village records to display GIS coverage." />}</Box></CardContent></Card>
          <Card variant="outlined" sx={{ mt: 2.25 }}><CardContent sx={{ p: { xs: 2, sm: 2.55 }, '&:last-child': { pb: { xs: 2, sm: 2.55 } } }}>{selected ? <><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} spacing={1.3}><Box><Stack direction="row" spacing={.7} alignItems="center" flexWrap="wrap"><LocationOnOutlined color="primary" /><Typography variant="h5">{selected.name}</Typography>{selected.hamlet && <Chip label={selected.hamlet} size="small" variant="outlined" />}</Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{selected.district.name} district{selected.block ? ` · ${selected.block.name} block` : ''} · Assigned officer: {selected.assignedOfficer?.fullName ?? 'Unassigned'}</Typography></Box><Stack direction="row" spacing={.5}>{canManage && <Tooltip title="Edit village"><IconButton aria-label="Edit village" onClick={() => openEdit(selected)}><EditOutlined /></IconButton></Tooltip>}{canManage && <Tooltip title="Assign officer"><IconButton aria-label="Assign officer" onClick={() => openAssignment(selected)}><PersonAddAltOutlined /></IconButton></Tooltip>}{isSuperAdmin && <Tooltip title="Delete village"><IconButton aria-label="Delete village" color="error" onClick={() => setDeleteCandidate(selected)}><DeleteOutline /></IconButton></Tooltip>}{selected.mapLatitude != null && selected.mapLongitude != null && <Button component="a" href={`https://www.openstreetmap.org/?mlat=${numberValue(selected.mapLatitude)}&mlon=${numberValue(selected.mapLongitude)}#map=14/${numberValue(selected.mapLatitude)}/${numberValue(selected.mapLongitude)}`} target="_blank" rel="noreferrer" variant="outlined" startIcon={<MapOutlined />}>Directions</Button>}</Stack></Stack><Grid container spacing={1.5} sx={{ mt: 1.7 }}><Grid size={{ xs: 6, md: 3 }}><Paper variant="outlined" sx={{ p: 1.4, borderRadius: 2 }}><GroupsOutlined color="primary" fontSize="small" /><Typography variant="h6" sx={{ mt: .5 }}>{selected.statistics.familyCount}</Typography><Typography variant="caption" color="text.secondary">Registered families</Typography></Paper></Grid><Grid size={{ xs: 6, md: 3 }}><Paper variant="outlined" sx={{ p: 1.4, borderRadius: 2 }}><AssignmentOutlined color="primary" fontSize="small" /><Typography variant="h6" sx={{ mt: .5 }}>{selected.statistics.applicationCount}</Typography><Typography variant="caption" color="text.secondary">Applications</Typography></Paper></Grid><Grid size={{ xs: 6, md: 3 }}><Paper variant="outlined" sx={{ p: 1.4, borderRadius: 2 }}><WarningAmberOutlined color="warning" fontSize="small" /><Typography variant="h6" sx={{ mt: .5 }}>{selected.statistics.pendingFamilies}</Typography><Typography variant="caption" color="text.secondary">Pending families</Typography></Paper></Grid><Grid size={{ xs: 6, md: 3 }}><Paper variant="outlined" sx={{ p: 1.4, borderRadius: 2 }}><PersonOutlined color="primary" fontSize="small" /><Typography variant="h6" sx={{ mt: .5 }}>{selected.population.toLocaleString()}</Typography><Typography variant="caption" color="text.secondary">Population</Typography></Paper></Grid></Grid><Divider sx={{ my: 2 }} /><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}><Box sx={{ flex: 1 }}><Stack direction="row" justifyContent="space-between"><Typography variant="body2" fontWeight={800}>Registered family coverage</Typography><Typography variant="body2" fontWeight={850} color="primary.main">{coverage(selected)}%</Typography></Stack><LinearProgress variant="determinate" value={coverage(selected)} sx={{ mt: .7, height: 8, borderRadius: 99, bgcolor: alpha(theme.palette.primary.main, .1), '& .MuiLinearProgress-bar': { borderRadius: 99 } }} /></Box><Typography variant="body2" color="text.secondary">{selected.statistics.fieldVisitCount ?? selected._count?.fieldVisits ?? 0} field visits</Typography></Stack></> : <EmptyState title="Select a village" description="Choose a village from the directory to view its live population and scheme statistics." />}</CardContent></Card>
          <Paper variant="outlined" sx={{ mt: 2.25, p: 1.5, borderRadius: 2.5 }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} justifyContent="space-between"><Typography variant="body2"><strong>{totalRegistered.toLocaleString()}</strong> registered families against a target of <strong>{totalTarget.toLocaleString()}</strong> across mapped villages.</Typography><Stack direction="row" spacing={.65} alignItems="center"><LayersOutlined color="primary" fontSize="small" /><Typography variant="caption" color="text.secondary">Markers cluster automatically as you zoom out.</Typography></Stack></Stack></Paper>
        </Grid>
      </Grid>
      <VillageEditor open={editorOpen} village={editing} form={form} districts={districtsQuery.data ?? []} blocks={blocksQuery.data ?? []} panchayats={panchayatsQuery.data ?? []} pending={saveMutation.isPending} error={formError} onClose={() => { setEditorOpen(false); setFormError(null); }} onChange={changeField} onSubmit={submitVillage} />
      <Dialog open={Boolean(assignmentVillage)} onClose={() => setAssignmentVillage(null)} fullWidth maxWidth="xs"><DialogTitle>Assign development officer</DialogTitle><DialogContent><Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{assignmentVillage?.name} · {assignmentVillage?.district.name}</Typography><FormControl fullWidth><InputLabel>Assigned officer</InputLabel><Select value={assignedOfficerId} label="Assigned officer" onChange={(event) => setAssignedOfficerId(event.target.value)}><MenuItem value="">Unassigned</MenuItem>{assignmentVillage?.assignedOfficer && assignmentVillage.assignedOfficer.id !== session.userId && <MenuItem value={assignmentVillage.assignedOfficer.id}>{assignmentVillage.assignedOfficer.fullName} (current)</MenuItem>}{isSuperAdmin ? (officersQuery.data ?? []).map((officer) => <MenuItem key={officer.id} value={officer.id}>{officer.fullName}{officer.mobile ? ` · ${officer.mobile}` : ''}</MenuItem>) : session.userId ? <MenuItem value={session.userId}>{session.name} (assign myself)</MenuItem> : null}</Select></FormControl>{!isSuperAdmin && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>District officers can assign themselves. A super-admin can assign another active officer in this district.</Typography>}{assignmentMutation.isError && <Alert severity="error" sx={{ mt: 1.5 }}>{assignmentMutation.error instanceof Error ? assignmentMutation.error.message : 'Officer assignment could not be saved.'}</Alert>}</DialogContent><DialogActions><Button onClick={() => setAssignmentVillage(null)}>Cancel</Button><Button variant="contained" disabled={assignmentMutation.isPending || !assignmentVillage} onClick={() => assignmentVillage && assignmentMutation.mutate({ villageId: assignmentVillage.id, officerId: assignedOfficerId || null })}>Save assignment</Button></DialogActions></Dialog>
      <Dialog open={Boolean(deleteCandidate)} onClose={() => setDeleteCandidate(null)} fullWidth maxWidth="xs"><DialogTitle>Delete village?</DialogTitle><DialogContent><Typography>“{deleteCandidate?.name}” can be deleted only when it has no linked families or development centres.</Typography>{deleteMutation.isError && <Alert severity="error" sx={{ mt: 1.5 }}>{deleteMutation.error instanceof Error ? deleteMutation.error.message : 'The village could not be deleted.'}</Alert>}</DialogContent><DialogActions><Button onClick={() => setDeleteCandidate(null)}>Cancel</Button><Button color="error" variant="contained" disabled={deleteMutation.isPending || !deleteCandidate} onClick={() => deleteCandidate && deleteMutation.mutate(deleteCandidate.id)}>Delete village</Button></DialogActions></Dialog>
    </Box>
  );
}
