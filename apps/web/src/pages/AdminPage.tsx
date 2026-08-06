import { AdminPanelSettingsOutlined, BackupOutlined, HistoryOutlined, ManageAccountsOutlined, SaveOutlined, SecurityOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { EmptyState, ErrorState, PageSkeleton } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';

type ManagedUser = { id: string; fullName: string; mobile: string; email?: string | null; role: string; status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'; district?: { name: string } | null };
type Permission = { id: string; key: string; description: string; roles: string[]; updatedAt?: string };
type AuditLog = { id: string; action: string; entityType: string; entityId: string; createdAt: string; actor?: { fullName: string } | null; metadata?: Record<string, unknown> | null };
type SystemSetting = { key: string; value: unknown; updatedAt?: string; updatedBy?: { fullName: string } | null };
type BackupRecord = { id: string; label: string; status: 'CREATED' | 'RESTORED' | 'FAILED'; createdAt: string; createdBy?: { fullName: string } | null; note?: string | null };
const roleOptions = ['SUPER_ADMIN', 'DEVELOPMENT_OFFICER', 'FIELD_VOLUNTEER', 'FAMILY'];

function listData<T>(path: string) {
  return apiRequest<{ data: T[] }>(path).then((response) => response.data);
}

function settingText(value: unknown) {
  return typeof value === 'string' ? value : JSON.stringify(value) ?? '';
}

async function settingsData() {
  const response = await apiRequest<{ data: Record<string, unknown> | SystemSetting[] }>('/admin/settings');
  if (Array.isArray(response.data)) return response.data;
  return Object.entries(response.data).map(([key, value]) => ({ key, value }));
}

export default function AdminPage() {
  const [tab, setTab] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingDraft, setSettingDraft] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ['admin', 'users'], queryFn: () => listData<ManagedUser>('/admin/users?limit=100') });
  const permissionsQuery = useQuery({ queryKey: ['admin', 'permissions'], queryFn: () => listData<Permission>('/admin/permissions') });
  const auditQuery = useQuery({ queryKey: ['admin', 'audit'], queryFn: () => listData<AuditLog>('/admin/audit-logs?limit=50') });
  const settingsQuery = useQuery({ queryKey: ['admin', 'settings'], queryFn: settingsData });
  const backupsQuery = useQuery({ queryKey: ['admin', 'backups'], queryFn: () => listData<BackupRecord>('/admin/backups') });

  const changeUser = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ManagedUser['status'] }) => apiRequest(`/admin/users/${id}`, { method: 'PATCH', json: { status } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] }); setNotice('User status updated.'); },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'The user could not be updated.'),
  });
  const changePermission = useMutation({
    mutationFn: ({ id, roles }: { id: string; roles: string[] }) => apiRequest(`/admin/permissions/${id}`, { method: 'PATCH', json: { roles } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'permissions'] }); setNotice('Permission roles updated.'); },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'The permission could not be updated.'),
  });
  const saveSetting = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => apiRequest('/admin/settings', { method: 'PUT', json: { [key]: value } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }); setNotice('System setting saved.'); },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'The setting could not be saved.'),
  });
  const createBackup = useMutation({
    mutationFn: () => apiRequest('/admin/backups', { method: 'POST', json: { label: `Portal backup ${new Date().toLocaleString('en-IN')}` } }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] }); setNotice('Backup request recorded. Configure the production storage adapter to persist the encrypted snapshot.'); },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'The backup request could not be created.'),
  });
  const restoreBackup = useMutation({
    mutationFn: (id: string) => apiRequest(`/admin/backups/${id}/restore`, { method: 'POST' }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['admin', 'backups'] }); setNotice('Restore workflow was recorded. Follow the controlled recovery process before exposing restored records.'); },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'The restore workflow could not be started.'),
  });

  const loading = usersQuery.isLoading || permissionsQuery.isLoading || auditQuery.isLoading || settingsQuery.isLoading || backupsQuery.isLoading;
  const error = usersQuery.error ?? permissionsQuery.error ?? auditQuery.error ?? settingsQuery.error ?? backupsQuery.error;
  const users = usersQuery.data ?? [];
  const permissions = permissionsQuery.data ?? [];
  const settings = settingsQuery.data ?? [];
  const backups = backupsQuery.data ?? [];
  const latestAudit = useMemo(() => (auditQuery.data ?? []).slice(0, 12), [auditQuery.data]);

  if (loading) return <PageSkeleton rows={5} />;
  if (error) return <ErrorState description={error instanceof Error ? error.message : 'Administrative data could not be loaded.'} onRetry={() => { void usersQuery.refetch(); void permissionsQuery.refetch(); void auditQuery.refetch(); void settingsQuery.refetch(); void backupsQuery.refetch(); }} />;

  return (
    <Box>
      <PageHeader title="Administration" eyebrow="System governance" description="Manage accounts, role permissions, audit history, operational settings, and recovery records." />
      {notice && <Alert severity={notice.includes('could not') ? 'error' : 'success'} onClose={() => setNotice(null)} sx={{ mb: 2 }}>{notice}</Alert>}
      <Paper variant="outlined" sx={{ borderRadius: 3, mb: 2.25 }}><Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" scrollButtons="auto"><Tab icon={<ManageAccountsOutlined />} iconPosition="start" label="Users" /><Tab icon={<SecurityOutlined />} iconPosition="start" label="Permissions" /><Tab icon={<HistoryOutlined />} iconPosition="start" label="Audit activity" /><Tab icon={<AdminPanelSettingsOutlined />} iconPosition="start" label="System & backup" /></Tabs></Paper>
      {tab === 0 && <Grid container spacing={2.1}>{users.map((user) => <Grid key={user.id} size={{ xs: 12, md: 6, xl: 4 }}><Card variant="outlined" sx={{ height: '100%' }}><CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}><Stack direction="row" justifyContent="space-between" spacing={1}><Box><Typography fontWeight={850}>{user.fullName}</Typography><Typography variant="caption" color="text.secondary">{user.mobile}{user.district?.name ? ` · ${user.district.name}` : ''}</Typography></Box><Chip label={user.role.replaceAll('_', ' ').toLowerCase()} size="small" variant="outlined" /></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1.2 }}>{user.email ?? 'No email address configured'}</Typography><FormControl fullWidth size="small" sx={{ mt: 1.65 }}><InputLabel>Account status</InputLabel><Select value={user.status} label="Account status" onChange={(event) => changeUser.mutate({ id: user.id, status: event.target.value as ManagedUser['status'] })} disabled={changeUser.isPending}><MenuItem value="ACTIVE">Active</MenuItem><MenuItem value="INACTIVE">Inactive</MenuItem><MenuItem value="SUSPENDED">Suspended</MenuItem></Select></FormControl></CardContent></Card></Grid>)}{!users.length && <Grid size={12}><EmptyState title="No users found" description="Create an officer, volunteer, or family portal user from the administration API." /></Grid>}</Grid>}
      {tab === 1 && <Stack spacing={1.3}>{permissions.map((permission) => <Paper key={permission.id} variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 2.5 }}><Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.25}><Box sx={{ flex: 1 }}><Typography fontWeight={850}>{permission.key}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .3 }}>{permission.description}</Typography><Stack direction="row" flexWrap="wrap" gap={.65} sx={{ mt: 1 }}>{permission.roles.map((role) => <Chip key={role} label={role.replaceAll('_', ' ')} size="small" color="primary" variant="outlined" />)}</Stack></Box><FormControl size="small" sx={{ minWidth: { xs: '100%', md: 280 } }}><InputLabel>Allowed roles</InputLabel><Select multiple value={permission.roles} label="Allowed roles" disabled={changePermission.isPending} onChange={(event) => { const roles = typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value; if (!roles.length) { setNotice('At least one role must retain this permission.'); return; } changePermission.mutate({ id: permission.id, roles }); }}>{roleOptions.map((role) => <MenuItem key={role} value={role}>{role.replaceAll('_', ' ')}</MenuItem>)}</Select></FormControl></Stack></Paper>)}{!permissions.length && <EmptyState title="No custom permissions configured" description="Built-in role protection remains active. Add scoped resource permissions through the administration API." />}</Stack>}
      {tab === 2 && <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.6 } }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6">Recent activity</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Every privileged action is retained with its actor and target.</Typography></Box><HistoryOutlined color="primary" /></Stack><Stack divider={<Divider flexItem />} sx={{ mt: 1.6 }}>{latestAudit.map((entry) => <Stack key={entry.id} direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={.75} sx={{ py: 1.25 }}><Box><Typography variant="body2" fontWeight={800}>{entry.action} · {entry.entityType}</Typography><Typography variant="caption" color="text.secondary">{entry.actor?.fullName ?? 'System'} · {entry.entityId}</Typography></Box><Typography variant="caption" color="text.secondary">{new Date(entry.createdAt).toLocaleString('en-IN')}</Typography></Stack>)}{!latestAudit.length && <EmptyState title="No audit records yet" description="Operational changes will appear here after the first audited action." />}</Stack></CardContent></Card>}
      {tab === 3 && <Grid container spacing={2.25}><Grid size={{ xs: 12, lg: 7 }}><Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.6 } }}><Stack direction="row" spacing={.8} alignItems="center"><AdminPanelSettingsOutlined color="primary" /><Typography variant="h6">System settings</Typography></Stack><Stack spacing={1.3} sx={{ mt: 1.8 }}>{settings.map((setting) => <Paper key={setting.key} variant="outlined" sx={{ p: 1.25, borderRadius: 2.2 }}><Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} spacing={1}><Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={800}>{setting.key}</Typography><Typography variant="caption" color="text.secondary">Updated {setting.updatedAt ? new Date(setting.updatedAt).toLocaleString('en-IN') : 'not recorded'}{setting.updatedBy?.fullName ? ` by ${setting.updatedBy.fullName}` : ''}</Typography></Box><TextField size="small" value={settingDraft[setting.key] ?? settingText(setting.value)} onChange={(event) => setSettingDraft((current) => ({ ...current, [setting.key]: event.target.value }))} sx={{ minWidth: { sm: 260 } }} /><Button size="small" startIcon={<SaveOutlined />} onClick={() => saveSetting.mutate({ key: setting.key, value: settingDraft[setting.key] ?? settingText(setting.value) })}>Save</Button></Stack></Paper>)}{!settings.length && <EmptyState title="No editable system settings" description="Configuration is maintained through environment variables until settings are added." />}</Stack></CardContent></Card></Grid><Grid size={{ xs: 12, lg: 5 }}><Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.6 } }}><Stack direction="row" spacing={.8} alignItems="center"><BackupOutlined color="primary" /><Typography variant="h6">Backup & restore</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .65 }}>Backup records are audit events. Production snapshots must use an approved encrypted database and object-storage provider.</Typography><Button variant="contained" fullWidth startIcon={<BackupOutlined />} disabled={createBackup.isPending} onClick={() => createBackup.mutate()} sx={{ mt: 1.8 }}>Create backup record</Button><Stack spacing={1} sx={{ mt: 1.7 }}>{backups.map((backup) => <Paper key={backup.id} variant="outlined" sx={{ p: 1.2, borderRadius: 2.2 }}><Stack direction="row" justifyContent="space-between" spacing={1}><Box><Typography variant="body2" fontWeight={800}>{backup.label}</Typography><Typography variant="caption" color="text.secondary">{new Date(backup.createdAt).toLocaleString('en-IN')}</Typography></Box><Stack alignItems="flex-end" spacing={.5}><Chip size="small" label={backup.status.toLowerCase()} color={backup.status === 'FAILED' ? 'error' : backup.status === 'RESTORED' ? 'warning' : 'success'} /><Button size="small" color="warning" disabled={restoreBackup.isPending || backup.status === 'FAILED'} onClick={() => restoreBackup.mutate(backup.id)}>Restore</Button></Stack></Stack></Paper>)}{!backups.length && <Typography variant="body2" color="text.secondary">No backup records have been created yet.</Typography>}</Stack></CardContent></Card></Grid></Grid>}
    </Box>
  );
}
