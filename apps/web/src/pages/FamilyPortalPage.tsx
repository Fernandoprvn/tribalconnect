import { AnnouncementOutlined, CheckCircleOutline, DescriptionOutlined, DownloadOutlined, PersonOutlined, PhoneAndroidOutlined, SchoolOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, Paper, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSelector } from 'react-redux';
import { EmptyState, ErrorState, PageSkeleton } from '../components/AsyncState';
import { PageHeader } from '../components/PageHeader';
import { apiDownload, apiRequest, type ApiFamily, type EligibilityResult } from '../lib/api';
import type { RootState } from '../store';

type PortalApplication = {
  id: string;
  applicationNumber: string;
  status: 'RECOMMENDED' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'BENEFIT_RECEIVED';
  submittedAt?: string | null;
  decidedAt?: string | null;
  benefitReceivedAt?: string | null;
  scheme: { name: string; code?: string; benefits?: string[] };
};

type Announcement = { id: string; title: string; content: string; publishedAt?: string | null };
type PortalOverview = {
  family: ApiFamily & { members?: Array<unknown>; income?: { annualIncome?: number | string | null }; documents?: Array<unknown> };
  applications: PortalApplication[];
  eligibleSchemes: EligibilityResult[];
  announcements: Announcement[];
};

const applicationTone: Record<PortalApplication['status'], 'default' | 'primary' | 'warning' | 'success' | 'error'> = {
  RECOMMENDED: 'primary',
  SUBMITTED: 'warning',
  UNDER_REVIEW: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  BENEFIT_RECEIVED: 'success',
};

function labelForStatus(status: PortalApplication['status']) {
  return status.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function FamilyPortalPage() {
  const session = useSelector((state: RootState) => state.session);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const portalQuery = useQuery({
    queryKey: ['family-portal', session.familyId],
    enabled: Boolean(session.familyId),
    queryFn: async () => (await apiRequest<{ data: PortalOverview }>('/portal/overview')).data,
  });

  if (!session.familyId) return <ErrorState title="No family profile is linked" description="Ask your Development Officer to link this mobile number to the family profile before using the family portal." />;
  if (portalQuery.isLoading) return <PageSkeleton rows={4} />;
  if (portalQuery.isError) return <ErrorState description={portalQuery.error instanceof Error ? portalQuery.error.message : 'Your family portal could not be loaded.'} onRetry={() => void portalQuery.refetch()} />;

  const overview = portalQuery.data;
  if (!overview) return <EmptyState title="No portal information yet" description="Your family profile will appear once the registration is saved." />;
  const family = overview.family;
  const memberCount = family.members?.length ?? 0;
  const income = Number(family.income?.annualIncome);

  return (
    <Box sx={{ maxWidth: 1280 }}>
      <PageHeader title={`Welcome, ${family.headName.split(' ')[0]}`} eyebrow="Tribal family portal" description="View your profile, check welfare eligibility, follow applications, and download approved letters in one secure place." />
      {downloadError && <Alert severity="error" onClose={() => setDownloadError(null)} sx={{ mb: 2.15 }}>{downloadError}</Alert>}
      <Grid container spacing={2.25}>
        <Grid size={{ xs: 12, lg: 7 }}>
          <Card variant="outlined">
            <CardContent sx={{ p: { xs: 2, sm: 2.7 } }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.4} alignItems={{ sm: 'flex-start' }}><Box><Stack direction="row" spacing={.8} alignItems="center"><PersonOutlined color="primary" /><Typography variant="h6">Your family profile</Typography></Stack><Typography variant="body2" color="text.secondary" sx={{ mt: .65 }}>Family ID: {family.familyCode} · Aadhaar remains masked for your privacy.</Typography></Box><Chip label={String(family.status).replaceAll('_', ' ').toLowerCase()} color={String(family.status) === 'APPROVED' ? 'success' : 'warning'} size="small" /></Stack>
              <Grid container spacing={1.45} sx={{ mt: 1.9 }}>
                {[
                  ['Village', family.village?.name ?? 'Not recorded'],
                  ['Community', String(family.tribalCommunity ?? 'Not recorded')],
                  ['Household members', `${memberCount} member${memberCount === 1 ? '' : 's'}`],
                  ['Annual income', Number.isFinite(income) ? `₹${income.toLocaleString('en-IN')}` : 'Not recorded'],
                ].map(([label, value]) => <Grid key={label} size={{ xs: 6, sm: 3 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" fontWeight={800} sx={{ mt: .25 }}>{value}</Typography></Grid>)}
              </Grid>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ mt: 2.25 }}>
            <CardContent sx={{ p: { xs: 2, sm: 2.7 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography variant="h6">Application status</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35 }}>Every recommended benefit and its latest stage.</Typography></Box><DescriptionOutlined color="primary" /></Stack>
              <Stack spacing={1.15} sx={{ mt: 2 }}>
                {overview.applications.map((application) => <Paper key={application.id} variant="outlined" sx={{ p: 1.45, borderRadius: 2.4 }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1.15}><Box><Typography variant="body2" fontWeight={800}>{application.scheme.name}</Typography><Typography variant="caption" color="text.secondary">{application.applicationNumber} · {application.submittedAt ? `Applied ${new Date(application.submittedAt).toLocaleDateString('en-IN')}` : 'Recommendation in progress'}</Typography></Box><Stack direction="row" spacing={.8} alignItems="center"><Chip label={labelForStatus(application.status)} color={applicationTone[application.status]} size="small" />{(application.status === 'APPROVED' || application.status === 'BENEFIT_RECEIVED') && <Button size="small" startIcon={<DownloadOutlined />} onClick={() => apiDownload(`/applications/${application.id}/approval-letter`, `${application.applicationNumber}-approval-letter.pdf`).catch((error: unknown) => setDownloadError(error instanceof Error ? error.message : 'The approval letter could not be downloaded.'))}>Letter</Button>}</Stack></Stack></Paper>)}
                {!overview.applications.length && <EmptyState title="No applications submitted" description="Eligible schemes will appear below once your profile is reviewed." />}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 5 }}>
          <Stack spacing={2.25}>
            <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}><Stack direction="row" spacing={.85} alignItems="center"><CheckCircleOutline color="primary" /><Typography variant="h6">Schemes you may be eligible for</Typography></Stack><Stack spacing={1} sx={{ mt: 1.65 }}>{overview.eligibleSchemes.slice(0, 5).map((scheme) => <Paper key={scheme.schemeId} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}><Typography variant="body2" fontWeight={800}>{scheme.schemeName}</Typography><Typography variant="caption" color="text.secondary">Your profile currently meets the listed eligibility conditions.</Typography></Paper>)}{!overview.eligibleSchemes.length && <Typography variant="body2" color="text.secondary">No active scheme matches have been found yet. Your officer can update your profile if details change.</Typography>}</Stack></CardContent></Card>
            <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.5 } }}><Stack direction="row" spacing={.85} alignItems="center"><AnnouncementOutlined color="primary" /><Typography variant="h6">Announcements</Typography></Stack><Stack spacing={1.2} divider={<Divider flexItem />} sx={{ mt: 1.5 }}>{overview.announcements.slice(0, 4).map((announcement) => <Box key={announcement.id}><Typography variant="body2" fontWeight={800}>{announcement.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .35, lineHeight: 1.45 }}>{announcement.content}</Typography>{announcement.publishedAt && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: .45 }}>{new Date(announcement.publishedAt).toLocaleDateString('en-IN')}</Typography>}</Box>)}{!overview.announcements.length && <Typography variant="body2" color="text.secondary">No announcements are available at the moment.</Typography>}</Stack></CardContent></Card>
            <Card variant="outlined"><CardContent sx={{ p: { xs: 2, sm: 2.4 } }}><Stack direction="row" spacing={1} alignItems="flex-start"><SchoolOutlined color="primary" /><Box><Typography fontWeight={800}>Need help with an application?</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .4 }}>Visit your Rural Development Center or ask a field volunteer for help with documents and status updates.</Typography><Button component="a" href="tel:18004256150" size="small" startIcon={<PhoneAndroidOutlined />} sx={{ mt: .75 }}>Call portal help line</Button></Box></Stack></CardContent></Card>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
