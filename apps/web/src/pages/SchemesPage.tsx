import { Add, CalendarTodayOutlined, DeleteOutline, EditOutlined, FilterListOutlined, LaunchOutlined, PeopleAltOutlined, Search, ToggleOffOutlined, ToggleOnOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, Grid, IconButton, InputAdornment, InputLabel, MenuItem, Pagination, Paper, Select, Stack, TextField, Tooltip, Typography, alpha, useTheme } from '@mui/material';
import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { EmptyState, ErrorState, PageSkeleton } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import type { RootState } from '../store';
import { dateLabel, primaryApi, titleCase, type PrimaryScheme, type SchemeInput, type SchemeStatus } from '../lib/primaryRecords';

const pageSize = 9;
const schemeStatuses: SchemeStatus[] = ['ACTIVE', 'DRAFT', 'ARCHIVED'];

type SchemeForm = {
  code: string;
  name: string;
  department: string;
  description: string;
  benefits: string;
  eligibilitySummary: string;
  criteria: string;
  requiredDocuments: string;
  lastDate: string;
  status: SchemeStatus;
  applicationLink: string;
};

const newSchemeForm = (): SchemeForm => ({
  code: '', name: '', department: '', description: '', benefits: '', eligibilitySummary: '', criteria: '{}', requiredDocuments: '', lastDate: '', status: 'DRAFT', applicationLink: '',
});

const splitList = (value: string) => value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);

function formForScheme(scheme: PrimaryScheme): SchemeForm {
  return {
    code: scheme.code,
    name: scheme.name,
    department: scheme.department,
    description: scheme.description,
    benefits: scheme.benefits.join('\n'),
    eligibilitySummary: scheme.eligibilitySummary ?? '',
    criteria: JSON.stringify(scheme.criteria, null, 2),
    requiredDocuments: scheme.requiredDocuments.join('\n'),
    lastDate: scheme.lastDate ? scheme.lastDate.slice(0, 10) : '',
    status: scheme.status,
    applicationLink: scheme.applicationLink ?? '',
  };
}

function statusColor(status: SchemeStatus) {
  return status === 'ACTIVE' ? 'success' as const : status === 'DRAFT' ? 'warning' as const : 'default' as const;
}

function SchemeEditor({ open, scheme, form, error, pending, onClose, onChange, onSubmit }: { open: boolean; scheme: PrimaryScheme | null; form: SchemeForm; error: string | null; pending: boolean; onClose: () => void; onChange: (field: keyof SchemeForm, value: string) => void; onSubmit: () => void }) {
  return <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>{scheme ? 'Edit scheme' : 'Add government scheme'}</DialogTitle>
    <DialogContent dividers>
      <Grid container spacing={1.6} sx={{ pt: .3 }}>
        <Grid size={{ xs: 12, sm: 4 }}><TextField fullWidth required label="Scheme code" value={form.code} disabled={Boolean(scheme)} onChange={(event) => onChange('code', event.target.value.toUpperCase())} helperText="3–40 uppercase letters, numbers, or hyphens" /></Grid>
        <Grid size={{ xs: 12, sm: 8 }}><TextField fullWidth required label="Scheme name" value={form.name} onChange={(event) => onChange('name', event.target.value)} /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required label="Department" value={form.department} onChange={(event) => onChange('department', event.target.value)} /></Grid>
        <Grid size={{ xs: 12, sm: 3 }}><FormControl fullWidth><InputLabel>Status</InputLabel><Select value={form.status} label="Status" onChange={(event) => onChange('status', event.target.value)}>{schemeStatuses.map((status) => <MenuItem value={status} key={status}>{titleCase(status)}</MenuItem>)}</Select></FormControl></Grid>
        <Grid size={{ xs: 12, sm: 3 }}><TextField fullWidth type="date" label="Last application date" value={form.lastDate} onChange={(event) => onChange('lastDate', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
        <Grid size={12}><TextField fullWidth required multiline minRows={3} label="Description" value={form.description} onChange={(event) => onChange('description', event.target.value)} /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth required multiline minRows={3} label="Benefits" value={form.benefits} onChange={(event) => onChange('benefits', event.target.value)} helperText="Enter one benefit per line or separate with commas." /></Grid>
        <Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth multiline minRows={3} label="Required documents" value={form.requiredDocuments} onChange={(event) => onChange('requiredDocuments', event.target.value)} helperText="Enter one document per line or separate with commas." /></Grid>
        <Grid size={12}><TextField fullWidth multiline minRows={2} label="Eligibility summary" value={form.eligibilitySummary} onChange={(event) => onChange('eligibilitySummary', event.target.value)} /></Grid>
        <Grid size={12}><TextField fullWidth multiline minRows={8} label="Eligibility criteria (JSON)" value={form.criteria} onChange={(event) => onChange('criteria', event.target.value)} helperText={'Example: {"maxAnnualIncome": 250000, "requireStudent": true}. Supported criteria cover community, income, age, occupation, disability, widow, senior citizen, land, housing and bank account.'} sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '.8rem' } }} /></Grid>
        <Grid size={12}><TextField fullWidth type="url" label="Application link (optional)" value={form.applicationLink} onChange={(event) => onChange('applicationLink', event.target.value)} /></Grid>
      </Grid>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </DialogContent>
    <DialogActions sx={{ p: 2 }}><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={pending} onClick={onSubmit}>{scheme ? 'Save changes' : 'Create scheme'}</Button></DialogActions>
  </Dialog>;
}

export default function SchemesPage() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const session = useSelector((state: RootState) => state.session);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState<SchemeStatus | ''>('');
  const [selected, setSelected] = useState<PrimaryScheme | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<PrimaryScheme | null>(null);
  const [form, setForm] = useState<SchemeForm>(newSchemeForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<PrimaryScheme | null>(null);
  const canManage = session.role === 'SUPER_ADMIN';
  const schemesQuery = useQuery({
    queryKey: ['schemes', page, deferredSearch, department, status],
    queryFn: () => primaryApi.schemes.list({ page, limit: pageSize, search: deferredSearch || undefined, department: department || undefined, status: status ? [status] : undefined }),
  });
  const invalidateSchemes = () => {
    void queryClient.invalidateQueries({ queryKey: ['schemes'] });
    void queryClient.invalidateQueries({ queryKey: ['application-filter-schemes'] });
    void queryClient.invalidateQueries({ queryKey: ['family-eligibility'] });
  };
  const saveMutation = useMutation({
    mutationFn: async (input: { scheme: PrimaryScheme | null; payload: SchemeInput }) => {
      if (!input.scheme) return primaryApi.schemes.create(input.payload);
      const { code: _code, ...update } = input.payload;
      return primaryApi.schemes.update(input.scheme.id, update);
    },
    onSuccess: () => { setEditorOpen(false); setEditing(null); setForm(newSchemeForm()); setFormError(null); invalidateSchemes(); },
    onError: (error) => setFormError(error instanceof Error ? error.message : 'The scheme could not be saved.'),
  });
  const statusMutation = useMutation({ mutationFn: (input: { scheme: PrimaryScheme; action: 'activate' | 'archive' }) => input.action === 'activate' ? primaryApi.schemes.activate(input.scheme.id) : primaryApi.schemes.deactivate(input.scheme.id), onSuccess: invalidateSchemes });
  const deleteMutation = useMutation({ mutationFn: (id: string) => primaryApi.schemes.remove(id), onSuccess: () => { setDeleteCandidate(null); invalidateSchemes(); } });
  const rows = schemesQuery.data?.data ?? [];
  const meta = schemesQuery.data?.meta;
  const departments = useMemo(() => [...new Set(rows.map((scheme) => scheme.department))].sort((left, right) => left.localeCompare(right)), [rows]);
  const resetFilters = () => { setSearch(''); setDepartment(''); setStatus(''); setPage(1); };
  const openNew = () => { setEditing(null); setForm(newSchemeForm()); setFormError(null); setEditorOpen(true); };
  const openEdit = (scheme: PrimaryScheme) => { setEditing(scheme); setForm(formForScheme(scheme)); setFormError(null); setEditorOpen(true); };
  const updateField = (field: keyof SchemeForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submitForm = () => {
    if (!form.code.trim() || !form.name.trim() || !form.department.trim() || !form.description.trim()) {
      setFormError('Code, name, department, and description are required.');
      return;
    }
    const benefits = splitList(form.benefits);
    if (!benefits.length) {
      setFormError('Add at least one benefit.');
      return;
    }
    let criteria: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(form.criteria || '{}');
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error();
      criteria = parsed as Record<string, unknown>;
    } catch {
      setFormError('Eligibility criteria must be a valid JSON object.');
      return;
    }
    setFormError(null);
    saveMutation.mutate({
      scheme: editing,
      payload: {
        code: form.code.trim(), name: form.name.trim(), department: form.department.trim(), description: form.description.trim(), benefits,
        eligibilitySummary: form.eligibilitySummary.trim() || undefined, criteria, requiredDocuments: splitList(form.requiredDocuments),
        lastDate: form.lastDate || undefined, status: form.status, applicationLink: form.applicationLink.trim() || undefined,
      },
    });
  };

  return (
    <Box>
      <PageHeader title="Government schemes" eyebrow="Scheme management" description="Manage welfare programmes, their eligibility rules, and availability for tribal families." action={canManage ? <Button variant="contained" startIcon={<Add />} onClick={openNew}>Add scheme</Button> : undefined} />
      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, mb: 2.4 }}>
        <Grid container spacing={1.2}>
          <Grid size={{ xs: 12, sm: 6, md: 5 }}><TextField value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} fullWidth size="small" placeholder="Search scheme name, code or department" slotProps={{ input: { startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> } }} /></Grid>
          <Grid size={{ xs: 7, sm: 3, md: 2.5 }}><FormControl fullWidth size="small"><InputLabel>Department</InputLabel><Select value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }} label="Department"><MenuItem value="">All departments</MenuItem>{departments.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}</Select></FormControl></Grid>
          <Grid size={{ xs: 5, sm: 3, md: 2.5 }}><FormControl fullWidth size="small"><InputLabel>Status</InputLabel><Select value={status} onChange={(event) => { setStatus(event.target.value as SchemeStatus | ''); setPage(1); }} label="Status"><MenuItem value="">All statuses</MenuItem>{schemeStatuses.map((item) => <MenuItem key={item} value={item}>{titleCase(item)}</MenuItem>)}</Select></FormControl></Grid>
          <Grid size={{ xs: 12, md: 2 }}><Button fullWidth variant="outlined" startIcon={<FilterListOutlined />} onClick={resetFilters}>Reset filters</Button></Grid>
        </Grid>
      </Paper>
      {schemesQuery.isLoading ? <PageSkeleton rows={5} /> : schemesQuery.isError ? <ErrorState title="Schemes could not be loaded" description={schemesQuery.error instanceof Error ? schemesQuery.error.message : undefined} onRetry={() => void schemesQuery.refetch()} /> : <>
        <Stack direction="row" spacing={.8} flexWrap="wrap" sx={{ mb: 2.05, rowGap: .8 }}><Chip label={`${meta?.total ?? rows.length} total`} color="primary" variant="outlined" /><Chip label={`${rows.filter((scheme) => scheme.status === 'ACTIVE').length} active on this page`} sx={{ bgcolor: '#DDF4E5', color: '#176B3A' }} /></Stack>
        {statusMutation.isError && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => statusMutation.reset()}>{statusMutation.error instanceof Error ? statusMutation.error.message : 'The scheme status could not be updated.'}</Alert>}
        {rows.length ? <Grid container spacing={2.15}>{rows.map((scheme) => <Grid key={scheme.id} size={{ xs: 12, md: 6, xl: 4 }}><Card variant="outlined" sx={{ height: '100%', overflow: 'visible', borderTop: `5px solid ${scheme.status === 'ACTIVE' ? theme.palette.primary.main : scheme.status === 'DRAFT' ? '#E6A700' : theme.palette.grey[400]}`, transition: '.2s', '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 16px 28px rgba(17,60,43,.1)' } }}><CardContent sx={{ p: 2.35, '&:last-child': { pb: 2.35 } }}><Stack direction="row" justifyContent="space-between" spacing={1}><Box sx={{ minWidth: 0 }}><Typography variant="overline" color="text.secondary" fontWeight={800} lineHeight={1}>{scheme.department}</Typography><Typography variant="h6" sx={{ mt: .55, lineHeight: 1.25 }}>{scheme.name}</Typography><Typography variant="caption" color="text.secondary">{scheme.code}</Typography></Box>{canManage && <Tooltip title="Edit scheme"><IconButton size="small" aria-label={`Edit ${scheme.name}`} onClick={() => openEdit(scheme)}><EditOutlined /></IconButton></Tooltip>}</Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.55, minHeight: 45 }}>{scheme.description}</Typography><Stack direction="row" spacing={.8} alignItems="center" flexWrap="wrap" sx={{ mt: 1.5, rowGap: .7 }}><Chip label={titleCase(scheme.status)} color={statusColor(scheme.status)} size="small" variant="outlined" />{scheme.lastDate && <Chip icon={<CalendarTodayOutlined />} label={dateLabel(scheme.lastDate)} size="small" variant="outlined" />}</Stack><Box sx={{ mt: 1.7, pt: 1.55, borderTop: `1px solid ${theme.palette.divider}` }}><Grid container spacing={1}><Grid size={6}><Typography variant="caption" color="text.secondary">Applications</Typography><Stack direction="row" alignItems="center" spacing={.45}><PeopleAltOutlined sx={{ fontSize: 15, color: 'text.secondary' }} /><Typography variant="body2" fontWeight={800}>{scheme._count?.applications ?? 0}</Typography></Stack></Grid><Grid size={6}><Typography variant="caption" color="text.secondary">Benefits</Typography><Typography variant="body2" fontWeight={800}>{scheme.benefits.length} listed</Typography></Grid></Grid></Box><Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.55 }}><Button size="small" onClick={() => setSelected(scheme)}>View details</Button>{canManage && <Stack direction="row" spacing={.25}>{scheme.status === 'ACTIVE' ? <Tooltip title="Archive scheme"><IconButton size="small" color="warning" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ scheme, action: 'archive' })}><ToggleOffOutlined /></IconButton></Tooltip> : <Tooltip title="Activate scheme"><IconButton size="small" color="success" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ scheme, action: 'activate' })}><ToggleOnOutlined /></IconButton></Tooltip>}<Tooltip title="Delete or archive"><IconButton size="small" color="error" onClick={() => setDeleteCandidate(scheme)}><DeleteOutline /></IconButton></Tooltip></Stack>}</Stack></CardContent></Card></Grid>)}</Grid> : <EmptyState title="No schemes found" description="Try a different search or filter, or add a new scheme when it is approved for publication." actionLabel="Clear filters" onAction={resetFilters} />}
        {meta && meta.totalPages > 1 && <Stack alignItems="center" sx={{ mt: 2.5 }}><Pagination page={page} count={meta.totalPages} onChange={(_, value) => setPage(value)} color="primary" /></Stack>}
      </>}
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="sm" fullWidth><DialogTitle>{selected?.name}</DialogTitle>{selected && <DialogContent dividers><Stack spacing={2.1}><Box><Typography variant="overline" color="text.secondary" fontWeight={800}>Description</Typography><Typography sx={{ mt: .25 }}>{selected.description}</Typography></Box><Box><Typography variant="overline" color="text.secondary" fontWeight={800}>Benefits</Typography><Stack gap={.65} sx={{ mt: .65 }}>{selected.benefits.map((benefit) => <Typography variant="body2" key={benefit}>• {benefit}</Typography>)}</Stack></Box><Box><Typography variant="overline" color="text.secondary" fontWeight={800}>Eligibility</Typography><Typography sx={{ mt: .25 }}>{selected.eligibilitySummary || 'Rules are evaluated against a family’s recorded profile.'}</Typography><Paper variant="outlined" sx={{ mt: 1, p: 1.2, bgcolor: alpha(theme.palette.primary.main, .035) }}><Typography component="pre" variant="caption" sx={{ display: 'block', m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(selected.criteria, null, 2)}</Typography></Paper></Box><Box><Typography variant="overline" color="text.secondary" fontWeight={800}>Required documents</Typography><Stack direction="row" flexWrap="wrap" gap={.7} sx={{ mt: .7 }}>{selected.requiredDocuments.length ? selected.requiredDocuments.map((document) => <Chip key={document} label={document} size="small" variant="outlined" />) : <Typography variant="body2" color="text.secondary">No additional documents configured.</Typography>}</Stack></Box>{selected.applicationLink && <Button component="a" href={selected.applicationLink} target="_blank" rel="noreferrer" startIcon={<LaunchOutlined />}>Open application link</Button>}</Stack></DialogContent>}<DialogActions sx={{ p: 2 }}><Button onClick={() => setSelected(null)}>Close</Button>{canManage && <Button variant="contained" startIcon={<EditOutlined />} onClick={() => { if (selected) { setSelected(null); openEdit(selected); } }}>Edit scheme</Button>}</DialogActions></Dialog>
      <SchemeEditor open={editorOpen} scheme={editing} form={form} error={formError} pending={saveMutation.isPending} onClose={() => { setEditorOpen(false); setFormError(null); }} onChange={updateField} onSubmit={submitForm} />
      <Dialog open={Boolean(deleteCandidate)} onClose={() => setDeleteCandidate(null)} maxWidth="xs" fullWidth><DialogTitle>Delete scheme?</DialogTitle><DialogContent><Typography>“{deleteCandidate?.name}” will be deleted when it has no applications. If application history exists, the system safely archives it instead.</Typography>{deleteMutation.isError && <Alert severity="error" sx={{ mt: 1.5 }}>{deleteMutation.error instanceof Error ? deleteMutation.error.message : 'The scheme could not be removed.'}</Alert>}</DialogContent><DialogActions><Button onClick={() => setDeleteCandidate(null)}>Cancel</Button><Button color="error" variant="contained" disabled={deleteMutation.isPending || !deleteCandidate} onClick={() => deleteCandidate && deleteMutation.mutate(deleteCandidate.id)}>Delete / archive</Button></DialogActions></Dialog>
    </Box>
  );
}
