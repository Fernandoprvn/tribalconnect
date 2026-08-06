import { CheckCircleRounded, ErrorOutlineRounded, FactCheckOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Typography, alpha, useTheme } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router-dom';
import { familiesApi, type EligibilityResult } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import type { RootState } from '../store';

function SchemeResultCard({ result, eligible }: { result: EligibilityResult; eligible: boolean }) {
  const theme = useTheme();
  const title = result.scheme?.name ?? result.schemeName;
  const code = result.scheme?.code ?? result.schemeCode;
  const department = result.scheme?.department;
  const conditions = result.conditions ?? [];

  return (
    <Card variant="outlined" sx={{ borderLeft: `4px solid ${eligible ? theme.palette.success.main : theme.palette.warning.main}` }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.4 }, '&:last-child': { pb: { xs: 2, sm: 2.4 } } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1.25}>
          <Box>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35 }}>
              {[code, department].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
          <Chip
            icon={eligible ? <CheckCircleRounded /> : <ErrorOutlineRounded />}
            label={eligible ? 'Eligible' : 'Not eligible'}
            color={eligible ? 'success' : 'warning'}
            variant={eligible ? 'filled' : 'outlined'}
            sx={{ alignSelf: { sm: 'flex-start' } }}
          />
        </Stack>

        {result.scheme?.description && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, lineHeight: 1.6 }}>{result.scheme.description}</Typography>}

        {eligible ? (
          <Alert severity="success" icon={<CheckCircleRounded />} sx={{ mt: 1.6 }}>
            All configured eligibility checks passed for this family.
          </Alert>
        ) : (
          <Box sx={{ mt: 1.6, p: 1.45, borderRadius: 2, bgcolor: alpha(theme.palette.warning.main, 0.08) }}>
            <Typography variant="subtitle2" fontWeight={800}>Why this scheme is not available yet</Typography>
            <Stack component="ul" spacing={0.45} sx={{ mt: 0.75, mb: 0, pl: 2.3 }}>
              {result.reasons.map((reason) => <Typography component="li" variant="body2" key={reason} color="text.secondary">{reason}</Typography>)}
            </Stack>
          </Box>
        )}

        {conditions.length > 0 && (
          <Stack direction="row" flexWrap="wrap" gap={0.7} sx={{ mt: 1.6 }}>
            {conditions.map((condition) => (
              <Chip
                key={condition.key}
                label={condition.message}
                size="small"
                color={condition.passed ? 'success' : 'default'}
                variant="outlined"
              />
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export default function EligibilityPage() {
  const session = useSelector((state: RootState) => state.session);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedFromQuery = searchParams.get('familyId') ?? '';
  const selectedFamilyId = session.role === 'FAMILY' ? session.familyId ?? '' : selectedFromQuery;
  const familyList = useQuery({
    queryKey: ['families', 'eligibility-picker'],
    queryFn: () => familiesApi.list({ limit: 100 }),
    enabled: session.role !== 'FAMILY',
    staleTime: 60_000,
  });
  const evaluation = useQuery({
    queryKey: ['family-eligibility', selectedFamilyId],
    queryFn: () => familiesApi.eligibility(selectedFamilyId),
    enabled: Boolean(selectedFamilyId),
  });
  const selectedFamily = familyList.data?.data.find((family) => family.id === selectedFamilyId);
  const eligible = evaluation.data?.eligibleSchemes ?? [];
  const ineligible = evaluation.data?.notEligibleSchemes ?? [];
  const error = familyList.error ?? evaluation.error;

  const chooseFamily = (familyId: string) => {
    const next = new URLSearchParams(searchParams);
    if (familyId) next.set('familyId', familyId);
    else next.delete('familyId');
    setSearchParams(next);
  };

  return (
    <Box sx={{ maxWidth: 1180 }}>
      <PageHeader
        title="Scheme eligibility"
        eyebrow="Eligibility engine"
        description="See every active welfare scheme evaluated against the family profile, with clear reasons for each result."
      />

      {session.role !== 'FAMILY' && (
        <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, mb: 2.4 }}>
          <FormControl fullWidth size="small" disabled={familyList.isLoading}>
            <InputLabel id="eligibility-family-label">Family to evaluate</InputLabel>
            <Select
              labelId="eligibility-family-label"
              label="Family to evaluate"
              value={selectedFromQuery}
              onChange={(event) => chooseFamily(event.target.value)}
            >
              <MenuItem value="">Select a family</MenuItem>
              {(familyList.data?.data ?? []).map((family) => (
                <MenuItem key={family.id} value={family.id}>
                  {family.headName} · {family.familyCode} · {family.village?.name ?? 'Village unavailable'}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Paper>
      )}

      {error && (
        <Alert
          severity="error"
          action={<Button color="inherit" size="small" onClick={() => { void familyList.refetch(); void evaluation.refetch(); }}>Try again</Button>}
          sx={{ mb: 2.4 }}
        >
          {error instanceof Error ? error.message : 'Eligibility results could not be loaded.'}
        </Alert>
      )}

      {!selectedFamilyId && !familyList.isLoading && (
        <Paper variant="outlined" sx={{ py: 7, px: 2, textAlign: 'center', borderRadius: 3 }}>
          <FactCheckOutlined color="primary" sx={{ fontSize: 44 }} />
          <Typography variant="h6" sx={{ mt: 1.2 }}>Choose a family to check eligibility</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>The result will consider age, income, community, occupation, disability, student, widow, senior-citizen and landholding rules.</Typography>
        </Paper>
      )}

      {(familyList.isLoading || evaluation.isLoading) && selectedFamilyId && (
        <Paper variant="outlined" sx={{ py: 7, textAlign: 'center', borderRadius: 3 }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.4 }}>Evaluating active schemes for this family…</Typography>
        </Paper>
      )}

      {selectedFamilyId && !evaluation.isLoading && !error && (
        <Stack spacing={2.25}>
          <Paper variant="outlined" sx={{ p: { xs: 1.6, sm: 2 }, borderRadius: 3, bgcolor: 'background.paper' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ sm: 'center' }} justifyContent="space-between" gap={1}>
              <Box>
                <Typography variant="subtitle1" fontWeight={800}>{selectedFamily?.headName ?? 'Selected family'}</Typography>
                <Typography variant="body2" color="text.secondary">{eligible.length} eligible · {ineligible.length} not eligible</Typography>
              </Box>
              <Button size="small" onClick={() => void evaluation.refetch()}>Re-evaluate</Button>
            </Stack>
          </Paper>

          <Box>
            <Typography variant="h6">Eligible schemes</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, mb: 1.35 }}>These schemes meet every configured rule.</Typography>
            <Stack spacing={1.35}>
              {eligible.map((result) => <SchemeResultCard key={result.schemeId} result={result} eligible />)}
              {eligible.length === 0 && <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}><Typography fontWeight={800}>No eligible schemes right now</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>Review the profile or try again after scheme rules are updated.</Typography></Paper>}
            </Stack>
          </Box>

          <Box>
            <Typography variant="h6">Not eligible</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.35, mb: 1.35 }}>Each result explains the exact criteria that did not match.</Typography>
            <Stack spacing={1.35}>
              {ineligible.map((result) => <SchemeResultCard key={result.schemeId} result={result} eligible={false} />)}
              {ineligible.length === 0 && <Paper variant="outlined" sx={{ p: 3, textAlign: 'center' }}><Typography fontWeight={800}>All evaluated schemes are eligible</Typography></Paper>}
            </Stack>
          </Box>
        </Stack>
      )}
    </Box>
  );
}
