import { CloudDoneOutlined, CloudUploadOutlined, GpsFixedOutlined, HistoryOutlined, LocationOnOutlined, SyncOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { EmptyState, ErrorState, PageSkeleton } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import { apiRequest } from '../lib/api';
import { enqueueOfflineRecord, listOfflineRecords, removeOfflineRecord, type OfflineRecord } from '../lib/offlineQueue';

type VolunteerFamily = { id: string; familyCode: string; headName: string; village?: { name: string } };
type FieldVisit = {
  id: string;
  purpose: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
  scheduledAt: string;
  completedAt?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  family?: { headName: string; familyCode: string; village?: { name: string } };
};
type VisitPayload = { familyId: string; purpose: string; latitude?: number; longitude?: number; status: 'COMPLETED'; scheduledAt: string; clientSyncId?: string };

const statusTone: Record<FieldVisit['status'], 'default' | 'success' | 'warning' | 'error'> = {
  SCHEDULED: 'warning',
  COMPLETED: 'success',
  MISSED: 'error',
  CANCELLED: 'default',
};

function captureCoordinates() {
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('GPS is not available on this device.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => reject(new Error('Location permission was not granted. You can still save a visit without GPS coordinates.')),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });
}

export default function FieldVolunteerPage() {
  const queryClient = useQueryClient();
  const [familyId, setFamilyId] = useState('');
  const [purpose, setPurpose] = useState('Household verification and GPS capture');
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [queue, setQueue] = useState<OfflineRecord<VisitPayload>[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const familiesQuery = useQuery({
    queryKey: ['volunteer', 'families'],
    queryFn: async () => (await apiRequest<{ data: VolunteerFamily[] }>('/families?limit=100')).data,
  });
  const visitsQuery = useQuery({
    queryKey: ['volunteer', 'visits'],
    queryFn: async () => (await apiRequest<{ data: FieldVisit[] }>('/volunteer/visits')).data,
  });

  useEffect(() => {
    void listOfflineRecords().then((records) => setQueue(records.filter((record): record is OfflineRecord<VisitPayload> => record.type === 'FIELD_VISIT')));
  }, []);

  const submitVisit = useMutation({
    mutationFn: async (payload: VisitPayload) => {
      if (!navigator.onLine) {
        const clientSyncId = globalThis.crypto?.randomUUID?.() ?? `visit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const queued = await enqueueOfflineRecord('FIELD_VISIT', { ...payload, clientSyncId });
        return { queued: true, id: queued.id };
      }
      await apiRequest('/volunteer/visits', { method: 'POST', json: payload });
      return { queued: false };
    },
    onSuccess: async (result) => {
      if (result.queued) {
        setQueue(await listOfflineRecords() as OfflineRecord<VisitPayload>[]);
        setNotice('The visit was saved offline and will sync when your connection returns.');
      } else {
        await queryClient.invalidateQueries({ queryKey: ['volunteer', 'visits'] });
        setNotice('Field visit saved and synced successfully.');
      }
      setFamilyId('');
      setCoordinates(null);
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'The field visit could not be saved.'),
  });

  const syncQueue = useMutation({
    mutationFn: async () => {
      const pending = await listOfflineRecords() as OfflineRecord<VisitPayload>[];
      for (const record of pending) {
        if (record.type !== 'FIELD_VISIT') continue;
        await apiRequest('/volunteer/visits', { method: 'POST', json: record.payload });
        await removeOfflineRecord(record.id);
      }
      return listOfflineRecords() as Promise<OfflineRecord<VisitPayload>[]>;
    },
    onSuccess: async (remaining) => {
      setQueue(remaining);
      await queryClient.invalidateQueries({ queryKey: ['volunteer', 'visits'] });
      setNotice(remaining.length ? 'Some records are still waiting to sync.' : 'All pending records are now synced.');
    },
    onError: (error) => setNotice(error instanceof Error ? error.message : 'Sync was interrupted. Your pending records remain on this device.'),
  });

  const familyOptions = useMemo(() => familiesQuery.data ?? [], [familiesQuery.data]);
  const canSave = Boolean(familyId && purpose.trim()) && !submitVisit.isPending;

  if (familiesQuery.isLoading || visitsQuery.isLoading) return <PageSkeleton rows={4} />;
  if (familiesQuery.isError || visitsQuery.isError) return <ErrorState description="Volunteer worklists could not be loaded. Your existing offline records remain safe on this device." onRetry={() => { void familiesQuery.refetch(); void visitsQuery.refetch(); }} />;

  const visits = visitsQuery.data ?? [];
  return (
    <Box>
      <PageHeader
        title="Field visits"
        eyebrow="Volunteer workspace"
        description="Capture household visits with GPS, keep working offline, and sync securely when connectivity is available."
        action={<Button variant="outlined" startIcon={<SyncOutlined />} disabled={!queue.length || syncQueue.isPending || !navigator.onLine} onClick={() => syncQueue.mutate()}>Sync {queue.length ? `${queue.length} pending` : 'records'}</Button>}
      />
      {notice && <Alert severity={notice.includes('could not') || notice.includes('interrupted') ? 'error' : 'success'} onClose={() => setNotice(null)} sx={{ mb: 2.1 }}>{notice}</Alert>}
      {!navigator.onLine && <Alert severity="warning" sx={{ mb: 2.1 }}>You are offline. New field visits will be kept in this browser&apos;s local queue and sent when you reconnect. Avoid using shared devices for sensitive work.</Alert>}
      <Grid container spacing={2.25}>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: { xs: 2, sm: 2.6 } }}>
              <Typography variant="h6">Record a household visit</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: .45 }}>Select a family from your authorised worklist, then save the visit with an optional GPS capture.</Typography>
              <Stack spacing={1.6} sx={{ mt: 2.2 }}>
                <FormControl fullWidth size="small">
                  <InputLabel>Family</InputLabel>
                  <Select value={familyId} label="Family" onChange={(event) => setFamilyId(event.target.value)}>
                    <MenuItem value="">Select a family</MenuItem>
                    {familyOptions.map((family) => <MenuItem key={family.id} value={family.id}>{family.headName} · {family.village?.name ?? 'Village'} · {family.familyCode}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField label="Visit purpose" size="small" value={purpose} onChange={(event) => setPurpose(event.target.value)} multiline minRows={2} />
                {captureError && <Alert severity="info" onClose={() => setCaptureError(null)}>{captureError}</Alert>}
                <Paper variant="outlined" sx={{ p: 1.35, borderRadius: 2.4 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                    <Stack direction="row" alignItems="center" spacing={.85}><LocationOnOutlined color="primary" fontSize="small" /><Box><Typography variant="body2" fontWeight={800}>GPS location</Typography><Typography variant="caption" color="text.secondary">{coordinates ? `${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}` : 'Not captured yet'}</Typography></Box></Stack>
                    <Button size="small" startIcon={<GpsFixedOutlined />} onClick={() => captureCoordinates().then((value) => { setCoordinates(value); setCaptureError(null); }).catch((error: unknown) => setCaptureError(error instanceof Error ? error.message : 'GPS could not be captured.'))}>Capture</Button>
                  </Stack>
                </Paper>
                <Button variant="contained" startIcon={navigator.onLine ? <CloudUploadOutlined /> : <CloudDoneOutlined />} disabled={!canSave} onClick={() => submitVisit.mutate({ familyId, purpose: purpose.trim(), status: 'COMPLETED', scheduledAt: new Date().toISOString(), ...(coordinates ?? {}) })}>
                  {submitVisit.isPending ? 'Saving…' : navigator.onLine ? 'Save visit' : 'Save offline'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ mt: 2.25 }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.4 } }}>
              <Stack direction="row" alignItems="center" spacing={.9}><CloudDoneOutlined color="primary" /><Typography variant="h6">Pending sync</Typography><Chip label={queue.length} size="small" color={queue.length ? 'warning' : 'success'} /></Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: .6 }}>{queue.length ? 'Queued visits remain on this device until they are acknowledged by the API.' : 'There are no unsynced visit records.'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: { xs: 2, sm: 2.6 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6">Visit history</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Scheduled and completed work for families you are permitted to visit.</Typography></Box><HistoryOutlined color="primary" /></Stack>
              <Stack spacing={1.1} sx={{ mt: 2 }}>
                {visits.map((visit) => <Paper key={visit.id} variant="outlined" sx={{ p: 1.45, borderRadius: 2.4 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}><Box><Typography variant="body2" fontWeight={800}>{visit.family?.headName ?? 'Family visit'}</Typography><Typography variant="caption" color="text.secondary">{visit.family?.village?.name ?? 'Assigned village'} · {visit.purpose}</Typography><Typography variant="caption" display="block" color="text.secondary" sx={{ mt: .45 }}>{new Date(visit.completedAt ?? visit.scheduledAt).toLocaleString('en-IN')}{visit.latitude != null ? ' · GPS captured' : ''}</Typography></Box><Chip label={visit.status.replace('_', ' ').toLowerCase()} color={statusTone[visit.status]} size="small" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' } }} /></Stack></Paper>)}
                {!visits.length && <EmptyState title="No visits yet" description="Your scheduled and completed household visits will appear here." />}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
