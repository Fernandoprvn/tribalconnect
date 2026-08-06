import { AdminPanelSettingsOutlined, DarkModeOutlined, EmailOutlined, HistoryOutlined, LanguageOutlined, LockOutlined, NotificationsNoneOutlined, PhoneAndroidOutlined, SaveOutlined, SmsOutlined, WbSunnyOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogContent, DialogTitle, Divider, FormControl, FormControlLabel, Grid, InputLabel, List, ListItem, ListItemText, MenuItem, Paper, Select, Skeleton, Stack, Switch, TextField, Typography, alpha, useTheme } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { PageHeader } from '../components/PageHeader';
import { auditApi, notificationsApi, settingsApi, type NotificationPreferences, type PortalSettings, type SettingsUpdateInput } from '../lib/operations';
import { useColorMode } from '../providers';
import type { RootState } from '../store';

const defaultPreferences: NotificationPreferences = { sms: false, whatsapp: false, email: false, inApp: true };

type SettingsDraft = {
  fullName: string;
  email: string;
  mobile: string;
  employeeId: string;
  assignedGeography: string;
  language: string;
  notifications: NotificationPreferences;
  system: Record<string, unknown>;
};

function makeDraft(settings: PortalSettings | undefined, session: RootState['session'], preferences?: NotificationPreferences): SettingsDraft {
  const profile = settings?.profile;
  return {
    fullName: profile?.fullName ?? session.name,
    email: profile?.email ?? session.email ?? '',
    mobile: profile?.mobile ?? session.mobile ?? '',
    employeeId: profile?.employeeId ?? '',
    assignedGeography: profile?.assignedGeography ?? '',
    language: settings?.language ?? 'English',
    notifications: preferences ?? settings?.notifications ?? defaultPreferences,
    system: settings?.system ?? {},
  };
}

function formatSettingLabel(key: string) {
  return key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayAuditDate(value?: string) {
  if (!value) return 'Recent activity';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function SettingsPage() {
  const theme = useTheme();
  const { mode, toggle } = useColorMode();
  const session = useSelector((state: RootState) => state.session);
  const queryClient = useQueryClient();
  const [auditOpen, setAuditOpen] = useState(false);
  const [draft, setDraft] = useState<SettingsDraft>(() => makeDraft(undefined, session));
  const settingsHydrated = useRef(false);
  const preferencesHydrated = useRef(false);
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get });
  const preferencesQuery = useQuery({ queryKey: ['notification-preferences'], queryFn: notificationsApi.preferences });
  const auditQuery = useQuery({ queryKey: ['audit-logs', 1, 12], queryFn: () => auditApi.list({ page: 1, limit: 12 }), enabled: auditOpen });

  useEffect(() => {
    if (!settingsQuery.data || settingsHydrated.current) return;
    settingsHydrated.current = true;
    setDraft((current) => ({ ...current, ...makeDraft(settingsQuery.data, session, current.notifications), notifications: current.notifications }));
  }, [session, settingsQuery.data]);

  useEffect(() => {
    if (!preferencesQuery.data || preferencesHydrated.current) return;
    preferencesHydrated.current = true;
    setDraft((current) => ({ ...current, notifications: preferencesQuery.data }));
  }, [preferencesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (next: SettingsDraft) => {
      const input: SettingsUpdateInput = {
        profile: {
          fullName: next.fullName.trim() || undefined,
          email: next.email.trim() || undefined,
          employeeId: next.employeeId.trim() || undefined,
        },
        language: { value: next.language },
        system: next.system,
        notifications: next.notifications,
      };
      const settings = await settingsApi.update(input);
      return { settings, preferences: settings.notifications ?? next.notifications };
    },
    onSuccess: ({ settings, preferences }) => {
      queryClient.setQueryData(['settings'], settings);
      queryClient.setQueryData(['notification-preferences'], preferences);
      // Rehydrate from the server response so read-only account attributes such
      // as mobile number and district assignment cannot appear to have changed.
      setDraft(makeDraft(settings, session, preferences));
    },
  });

  const editableSystemSettings = useMemo(() => Object.entries(draft.system).filter(([key, value]) => !/secret|password|token|private.?key/i.test(key) && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')), [draft.system]);
  const isLoading = settingsQuery.isLoading && !settingsQuery.data;
  const setPreference = (key: keyof NotificationPreferences, value: boolean) => setDraft((current) => ({ ...current, notifications: { ...current.notifications, [key]: value } }));
  const setSystemValue = (key: string, value: string | boolean) => setDraft((current) => {
    const previous = current.system[key];
    const nextValue = typeof previous === 'number' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
    return { ...current, system: { ...current.system, [key]: nextValue } };
  });

  return (
    <Box sx={{ maxWidth: 1060 }}>
      <PageHeader title="Settings" eyebrow="Account & workspace" description="Manage your profile, communication preferences and workspace accessibility." action={<Button variant="contained" startIcon={<SaveOutlined />} disabled={isLoading || saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>{saveMutation.isPending ? 'Saving…' : 'Save changes'}</Button>} />
      {saveMutation.isSuccess && <Alert severity="success" sx={{ mb: 2.2 }}>Your settings have been saved.</Alert>}
      {(settingsQuery.isError || preferencesQuery.isError || saveMutation.isError) && <Alert severity="error" sx={{ mb: 2.2 }} action={<Button color="inherit" size="small" onClick={() => { void settingsQuery.refetch(); void preferencesQuery.refetch(); }}>Retry</Button>}>Some settings could not be loaded or saved. Your current session settings remain available.</Alert>}
      {isLoading ? <Grid container spacing={2.25}><Grid size={{ xs: 12, md: 7 }}><Card variant="outlined"><CardContent><Skeleton width="35%" height={32} /><Skeleton height={160} /></CardContent></Card></Grid><Grid size={{ xs: 12, md: 5 }}><Card variant="outlined"><CardContent><Skeleton width="45%" height={32} /><Skeleton height={150} /></CardContent></Card></Grid></Grid> : <Grid container spacing={2.25}><Grid size={{ xs: 12, md: 7 }}><Stack spacing={2.25}><Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.6 } }}><Stack direction="row" spacing={1} alignItems="center"><AdminPanelSettingsOutlined color="primary" /><Typography variant="h6">Profile & access</Typography></Stack><Grid container spacing={1.6} sx={{ mt: 1.55 }}><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Display name" value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Employee ID" value={draft.employeeId} onChange={(event) => setDraft((current) => ({ ...current, employeeId: event.target.value }))} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Mobile number" value={draft.mobile} onChange={(event) => setDraft((current) => ({ ...current, mobile: event.target.value }))} inputProps={{ inputMode: 'numeric' }} /></Grid><Grid size={{ xs: 12, sm: 6 }}><TextField fullWidth label="Email address" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} /></Grid><Grid size={12}><TextField fullWidth label="Assigned geography" value={draft.assignedGeography} onChange={(event) => setDraft((current) => ({ ...current, assignedGeography: event.target.value }))} helperText="Assignments are applied by your authorised administration workflow." /></Grid></Grid></CardContent></Card>
        <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.6 } }}><Stack direction="row" spacing={1} alignItems="center"><NotificationsNoneOutlined color="primary" /><Typography variant="h6">Delivery preferences</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Choose how you want to receive operational updates.</Typography><Stack divider={<Divider flexItem />} sx={{ mt: 1.4 }}><FormControlLabel control={<Switch checked={draft.notifications.sms} onChange={(event) => setPreference('sms', event.target.checked)} />} label={<Stack direction="row" spacing={.85} alignItems="center"><SmsOutlined fontSize="small" /><Box><Typography variant="body2" fontWeight={800}>SMS alerts</Typography><Typography variant="caption" color="text.secondary">Urgent case actions and verification reminders</Typography></Box></Stack>} sx={{ m: 0, py: 1.2, alignItems: 'center' }} /><FormControlLabel control={<Switch checked={draft.notifications.whatsapp} onChange={(event) => setPreference('whatsapp', event.target.checked)} />} label={<Stack direction="row" spacing={.85} alignItems="center"><PhoneAndroidOutlined fontSize="small" /><Box><Typography variant="body2" fontWeight={800}>WhatsApp updates</Typography><Typography variant="caption" color="text.secondary">Family-friendly application updates</Typography></Box></Stack>} sx={{ m: 0, py: 1.2, alignItems: 'center' }} /><FormControlLabel control={<Switch checked={draft.notifications.email} onChange={(event) => setPreference('email', event.target.checked)} />} label={<Stack direction="row" spacing={.85} alignItems="center"><EmailOutlined fontSize="small" /><Box><Typography variant="body2" fontWeight={800}>Email alerts</Typography><Typography variant="caption" color="text.secondary">Receive operational updates at your saved email address</Typography></Box></Stack>} sx={{ m: 0, py: 1.2, alignItems: 'center' }} /><FormControlLabel control={<Switch checked={draft.notifications.inApp} onChange={(event) => setPreference('inApp', event.target.checked)} />} label={<Stack direction="row" spacing={.85} alignItems="center"><NotificationsNoneOutlined fontSize="small" /><Box><Typography variant="body2" fontWeight={800}>In-app history</Typography><Typography variant="caption" color="text.secondary">Keep a notification record in the portal</Typography></Box></Stack>} sx={{ m: 0, py: 1.2, alignItems: 'center' }} /></Stack><Button component={Link} to="/notifications" size="small" sx={{ mt: 1 }}>Open notification history</Button></CardContent></Card>
      </Stack></Grid><Grid size={{ xs: 12, md: 5 }}><Stack spacing={2.25}><Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.6 } }}><Stack direction="row" spacing={1} alignItems="center"><LanguageOutlined color="primary" /><Typography variant="h6">Language & appearance</Typography></Stack><FormControl fullWidth sx={{ mt: 1.7 }}><InputLabel>Portal language</InputLabel><Select value={draft.language} onChange={(event) => setDraft((current) => ({ ...current, language: event.target.value }))} label="Portal language"><MenuItem value="English">English</MenuItem><MenuItem value="Tamil">Tamil</MenuItem><MenuItem value="Tribal">Tribal language (when available)</MenuItem></Select></FormControl><Box sx={{ p: 1.45, mt: 1.5, borderRadius: 2.4, bgcolor: alpha(theme.palette.primary.main, .06) }}><Stack direction="row" justifyContent="space-between" alignItems="center"><Stack direction="row" spacing={.8} alignItems="center">{mode === 'light' ? <WbSunnyOutlined color="warning" /> : <DarkModeOutlined color="primary" />}<Box><Typography variant="body2" fontWeight={800}>{mode === 'light' ? 'Light mode' : 'Dark mode'}</Typography><Typography variant="caption" color="text.secondary">This appearance preference is stored on this device</Typography></Box></Stack><Switch checked={mode === 'dark'} onChange={toggle} inputProps={{ 'aria-label': 'Toggle dark mode' }} /></Stack></Box></CardContent></Card>
        <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.6 } }}><Stack direction="row" spacing={1} alignItems="center"><AdminPanelSettingsOutlined color="primary" /><Typography variant="h6">System configuration</Typography></Stack>{editableSystemSettings.length ? <Stack spacing={1.2} sx={{ mt: 1.55 }}>{editableSystemSettings.map(([key, value]) => typeof value === 'boolean' ? <FormControlLabel key={key} control={<Switch checked={value} onChange={(event) => setSystemValue(key, event.target.checked)} />} label={formatSettingLabel(key)} sx={{ m: 0 }} /> : <TextField key={key} fullWidth size="small" label={formatSettingLabel(key)} value={String(value)} onChange={(event) => setSystemValue(key, event.target.value)} />)}</Stack> : <Typography variant="body2" color="text.secondary" sx={{ mt: 1.1, lineHeight: 1.6 }}>No editable system configuration was returned for this account.</Typography>}</CardContent></Card>
        <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.6 } }}><Stack direction="row" spacing={1} alignItems="center"><LockOutlined color="primary" /><Typography variant="h6">Privacy & security</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .7, lineHeight: 1.6 }}>{session.mobile ? `Signed in with ${session.mobile}.` : 'Your active session is protected by the portal authentication service.'} Sensitive record access is recorded in the audit log where enabled.</Typography><Button variant="outlined" fullWidth startIcon={<HistoryOutlined />} sx={{ mt: 1.8 }} onClick={() => setAuditOpen(true)}>View audit activity</Button></CardContent></Card></Stack></Grid></Grid>}
      <Dialog open={auditOpen} onClose={() => setAuditOpen(false)} maxWidth="sm" fullWidth><DialogTitle>Recent audit activity</DialogTitle><DialogContent dividers>{auditQuery.isLoading ? <Stack spacing={1}><Skeleton /><Skeleton /><Skeleton /></Stack> : auditQuery.isError ? <Alert severity="error">Audit history could not be loaded for this account.</Alert> : auditQuery.data?.items.length ? <List disablePadding>{auditQuery.data.items.map((entry) => <ListItem key={entry.id} disableGutters divider><ListItemText primary={<Typography fontWeight={750}>{entry.action} · {entry.entityType}</Typography>} secondary={`${entry.actorName ? `${entry.actorName} · ` : ''}${displayAuditDate(entry.createdAt)}`} /></ListItem>)}</List> : <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}><Typography variant="body2" color="text.secondary">No audit events are available for this account.</Typography></Paper>}</DialogContent></Dialog>
    </Box>
  );
}
