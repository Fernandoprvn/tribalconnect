import { CheckCircleRounded, DoneAllOutlined, EmailOutlined, InfoOutlined, NotificationsActiveOutlined, PhoneAndroidOutlined, ScheduleOutlined, SmsOutlined, WarningAmberOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, FormControlLabel, List, ListItem, ListItemAvatar, ListItemText, Skeleton, Stack, Switch, Typography, alpha, useTheme } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { notificationsApi, type NotificationPreferences, type NotificationStatusFilter, type OperationsNotification } from '../lib/operations';

const iconFor = (item: OperationsNotification) => {
  const title = item.title.toLowerCase();
  if (item.status.includes('FAIL') || item.status.includes('PENDING')) return <WarningAmberOutlined />;
  if (title.includes('approved') || title.includes('completed') || title.includes('verified')) return <CheckCircleRounded />;
  return <InfoOutlined />;
};

const colorFor = (item: OperationsNotification) => {
  const title = item.title.toLowerCase();
  if (item.status.includes('FAIL') || item.status.includes('PENDING')) return '#9A6700';
  if (title.includes('approved') || title.includes('completed') || title.includes('verified')) return '#176B3A';
  return '#365CA8';
};

function formatTime(value?: string) {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  const deltaMinutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (Math.abs(deltaMinutes) < 60) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(deltaMinutes, 'minute');
  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(deltaHours, 'hour');
  const deltaDays = Math.round(deltaHours / 24);
  if (Math.abs(deltaDays) < 7) return new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(deltaDays, 'day');
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
}

export default function NotificationsPage() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<NotificationStatusFilter>('all');
  const [page, setPage] = useState(1);
  const notificationsQuery = useQuery({
    queryKey: ['notifications', status, page],
    queryFn: () => notificationsApi.list({ page, limit: 20, status }),
  });
  const preferencesQuery = useQuery({ queryKey: ['notification-preferences'], queryFn: notificationsApi.preferences });
  const items = notificationsQuery.data?.items ?? [];
  const meta = notificationsQuery.data?.meta;
  const unread = items.filter((item) => !item.read).length;
  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const preferencesMutation = useMutation({
    mutationFn: notificationsApi.updatePreferences,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });
  const updateStatus = (next: NotificationStatusFilter) => {
    setStatus(next);
    setPage(1);
  };
  const setPreference = (key: keyof NotificationPreferences, checked: boolean) => {
    preferencesMutation.mutate({ [key]: checked } as Partial<NotificationPreferences>);
  };
  const markAsRead = (item: OperationsNotification) => {
    if (!item.read && !(markReadMutation.isPending && markReadMutation.variables === item.id)) markReadMutation.mutate(item.id);
  };

  return (
    <Box sx={{ maxWidth: 920 }}>
      <PageHeader title="Notifications" eyebrow="Updates" description="Important case updates, reminders and service announcements." action={<Button variant="outlined" startIcon={<DoneAllOutlined />} disabled={!meta?.total || markAllMutation.isPending} onClick={() => markAllMutation.mutate()}>Mark all as read</Button>} />
      {(notificationsQuery.isError || markReadMutation.isError || markAllMutation.isError || preferencesMutation.isError) && <Alert severity="error" sx={{ mb: 2.2 }} action={<Button color="inherit" size="small" onClick={() => void notificationsQuery.refetch()}>Retry</Button>}>We could not update notification data. Please try again.</Alert>}
      <Stack direction="row" spacing={1} sx={{ mb: 2.2, flexWrap: 'wrap', rowGap: 1 }}><Chip label={`${unread} unread`} color="primary" onClick={() => updateStatus('unread')} clickable={status !== 'unread'} /><Chip label={meta ? `${meta.total} in history` : 'All updates'} variant={status === 'all' ? 'filled' : 'outlined'} color={status === 'all' ? 'primary' : 'default'} onClick={() => updateStatus('all')} clickable={status !== 'all'} /><Chip label="Read" variant={status === 'read' ? 'filled' : 'outlined'} color={status === 'read' ? 'primary' : 'default'} onClick={() => updateStatus('read')} clickable={status !== 'read'} /></Stack>
      <Card variant="outlined"><CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        {notificationsQuery.isLoading && !notificationsQuery.data ? <List disablePadding>{Array.from({ length: 4 }, (_, index) => <ListItem key={index} sx={{ px: { xs: 1.7, sm: 2.5 }, py: 1.8 }}><ListItemAvatar><Skeleton variant="rounded" width={42} height={42} /></ListItemAvatar><ListItemText primary={<Skeleton width="40%" />} secondary={<Skeleton width="75%" />} /></ListItem>)}</List> : items.length ? <List disablePadding>{items.map((item, index) => <ListItem key={item.id} alignItems="flex-start" divider={index < items.length - 1} sx={{ px: { xs: 1.7, sm: 2.5 }, py: 1.8, bgcolor: item.read ? 'transparent' : alpha(theme.palette.primary.main, .035), cursor: item.read ? 'default' : 'pointer' }} role={!item.read ? 'button' : undefined} tabIndex={!item.read ? 0 : undefined} aria-label={!item.read ? `Mark ${item.title} as read` : undefined} onKeyDown={(event) => { if (!item.read && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); markAsRead(item); } }} onClick={() => markAsRead(item)}><ListItemAvatar><Box sx={{ width: 42, height: 42, borderRadius: 2.3, display: 'grid', placeItems: 'center', bgcolor: alpha(colorFor(item), .12), color: colorFor(item) }}>{iconFor(item)}</Box></ListItemAvatar><ListItemText primary={<Stack direction="row" justifyContent="space-between" spacing={1.5}><Typography fontWeight={item.read ? 700 : 850}>{item.title}</Typography><Typography variant="caption" color="text.secondary" noWrap>{formatTime(item.createdAt)}</Typography></Stack>} secondary={<Typography variant="body2" color="text.secondary" sx={{ mt: .45, lineHeight: 1.5 }}>{item.body || 'Open this notification for the latest update.'}</Typography>} /><Box sx={{ width: 8, pt: .55 }}>{!item.read && <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main' }} />}</Box></ListItem>)}</List> : <Box sx={{ py: 7, px: 3, textAlign: 'center' }}><NotificationsActiveOutlined color="disabled" sx={{ fontSize: 40 }} /><Typography variant="h6" sx={{ mt: 1 }}>No notifications found</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>Updates matching this history filter will appear here.</Typography></Box>}
      </CardContent></Card>
      {meta && meta.totalPages > 1 && <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1.5 }}><Button size="small" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button><Typography variant="caption" color="text.secondary">Page {meta.page} of {meta.totalPages}</Typography><Button size="small" disabled={page >= meta.totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></Stack>}
      <Card variant="outlined" sx={{ mt: 2.2 }}><CardContent><Stack direction="row" spacing={1.3} alignItems="flex-start"><NotificationsActiveOutlined color="primary" /><Box sx={{ flex: 1 }}><Typography fontWeight={800}>Notification preferences</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Choose which delivery channels should receive operational updates. In-app history stays available regardless of delivery preference.</Typography>{preferencesQuery.isLoading ? <Skeleton width="70%" sx={{ mt: 1.3 }} /> : <Stack divider={<Divider flexItem />} sx={{ mt: 1.2 }}><FormControlLabel control={<Switch size="small" checked={preferencesQuery.data?.sms ?? false} disabled={preferencesMutation.isPending} onChange={(event) => setPreference('sms', event.target.checked)} />} label={<Stack direction="row" spacing={.75} alignItems="center"><SmsOutlined fontSize="small" /><Typography variant="body2">SMS alerts</Typography></Stack>} sx={{ m: 0, py: .45 }} /><FormControlLabel control={<Switch size="small" checked={preferencesQuery.data?.whatsapp ?? false} disabled={preferencesMutation.isPending} onChange={(event) => setPreference('whatsapp', event.target.checked)} />} label={<Stack direction="row" spacing={.75} alignItems="center"><PhoneAndroidOutlined fontSize="small" /><Typography variant="body2">WhatsApp updates</Typography></Stack>} sx={{ m: 0, py: .45 }} /><FormControlLabel control={<Switch size="small" checked={preferencesQuery.data?.email ?? false} disabled={preferencesMutation.isPending} onChange={(event) => setPreference('email', event.target.checked)} />} label={<Stack direction="row" spacing={.75} alignItems="center"><EmailOutlined fontSize="small" /><Typography variant="body2">Email summary</Typography></Stack>} sx={{ m: 0, py: .45 }} /></Stack>}<Button component={Link} to="/settings" size="small" startIcon={<ScheduleOutlined />} sx={{ mt: 1 }}>Manage all preferences</Button></Box></Stack></CardContent></Card>
    </Box>
  );
}
