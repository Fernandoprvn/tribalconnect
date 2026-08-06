import { ArrowBack, CheckCircleRounded, LockOutlined, PhoneAndroidOutlined, ShieldOutlined } from '@mui/icons-material';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, Box, Button, Card, CardContent, Chip, FormControl, FormHelperText, InputLabel, MenuItem, Select, Stack, TextField, Typography, alpha } from '@mui/material';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as yup from 'yup';
import { PublicTopBar } from '../components/AppShell';
import { useDispatch } from 'react-redux';
import { authApi, ApiError } from '../lib/api';
import { signIn, type AppDispatch } from '../store';
import type { UserRole } from '../types';

type LoginValues = { mobile: string; role: UserRole; otp: string };
const schema = yup.object({
  mobile: yup.string().matches(/^\d{10}$/, 'Enter a valid 10-digit mobile number').required('Mobile number is required'),
  role: yup.mixed<UserRole>().oneOf(['SUPER_ADMIN', 'DEVELOPMENT_OFFICER', 'FIELD_VOLUNTEER', 'FAMILY']).required(),
  otp: yup.string().defined().matches(/^$|^\d{4,8}$/, 'Enter the OTP sent to your mobile number'),
});

const roleNames: Record<UserRole, string> = { SUPER_ADMIN: 'Super Admin', DEVELOPMENT_OFFICER: 'Development Officer', FIELD_VOLUNTEER: 'Field Volunteer', FAMILY: 'Tribal Family' };

export default function LoginPage() {
  const [otpSent, setOtpSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const { control, handleSubmit, formState: { errors }, trigger, setError, setValue } = useForm<LoginValues>({ resolver: yupResolver(schema), defaultValues: { mobile: '', role: 'DEVELOPMENT_OFFICER', otp: '' } });
  const requestOtp = async (values?: Pick<LoginValues, 'mobile' | 'role'>) => {
    const valid = values ? true : await trigger(['mobile', 'role']);
    if (!valid) return;
    const requestValues = values ?? { mobile: '', role: 'DEVELOPMENT_OFFICER' as UserRole };
    setPending(true);
    setRequestError(null);
    try {
      const response = await authApi.requestOtp(requestValues);
      setOtpSent(true);
      setRequestMessage(response.message);
      setDevelopmentCode(response.developmentCode ?? null);
      setValue('otp', '');
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'We could not send an OTP. Please try again.');
    } finally {
      setPending(false);
    }
  };
  const submit = async (values: LoginValues) => {
    if (!otpSent) {
      await requestOtp({ mobile: values.mobile, role: values.role });
      return;
    }
    if (!/^\d{4,8}$/.test(values.otp)) {
      setError('otp', { type: 'validate', message: 'Enter the OTP sent to your mobile number' });
      return;
    }
    setPending(true);
    setRequestError(null);
    try {
      const session = await authApi.verifyOtp({ mobile: values.mobile, role: values.role, code: values.otp });
      dispatch(signIn(session));
      const state = location.state as { from?: { pathname?: string; search?: string } } | null;
      const requestedPath = state?.from?.pathname && state.from.pathname !== '/login' ? `${state.from.pathname}${state.from.search ?? ''}` : null;
      navigate(session.user.role === 'FAMILY' ? '/portal' : requestedPath ?? '/dashboard', { replace: true });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'We could not verify that OTP. Please try again.';
      setRequestError(message);
    } finally {
      setPending(false);
    }
  };
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', color: 'text.primary' }}>
      <PublicTopBar />
      <Box sx={{ maxWidth: 1120, mx: 'auto', px: { xs: 2, sm: 4 }, py: { xs: 3, md: 7 }, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr .95fr' }, alignItems: 'center', gap: { xs: 4, md: 8 } }}>
        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          <Chip icon={<ShieldOutlined />} label="Secure access" sx={{ bgcolor: '#E1F2E9', color: '#0B6E4F', mb: 2.3, fontWeight: 800 }} />
          <Typography variant="h2" sx={{ fontSize: '3rem', maxWidth: 480 }}>Your welfare journey, in one trusted place.</Typography>
          <Typography color="text.secondary" sx={{ mt: 1.7, maxWidth: 465, lineHeight: 1.7 }}>Use your mobile number to securely access your profile, applications and updates. No password to remember.</Typography>
          <Stack spacing={1.55} sx={{ mt: 3.8 }}>
            {['Mobile OTP login — no password needed', 'Your Aadhaar is always masked in the portal', 'Available in English and Tamil'].map((item) => <Stack key={item} direction="row" spacing={1.15} alignItems="center"><CheckCircleRounded color="primary" fontSize="small" /><Typography variant="body2" fontWeight={650}>{item}</Typography></Stack>)}
          </Stack>
          <Box sx={{ mt: 5, p: 2.5, bgcolor: '#173229', borderRadius: 4, color: '#fff', maxWidth: 465 }}><Typography variant="caption" sx={{ color: alpha('#fff', .68) }}>Need help signing in?</Typography><Typography fontWeight={800} sx={{ mt: .35 }}>Call the portal help line: 1800 425 6150</Typography></Box>
        </Box>
        <Card variant="outlined" sx={{ borderRadius: 4, overflow: 'visible' }}>
          <CardContent sx={{ p: { xs: 2.5, sm: 4 }, '&:last-child': { pb: { xs: 2.5, sm: 4 } } }}>
            <Button component={Link} to="/" startIcon={<ArrowBack />} size="small" sx={{ mb: 2 }}>Back to portal</Button>
            <Typography variant="h4">Sign in</Typography>
            <Typography color="text.secondary" sx={{ mt: .6 }}>Enter your mobile number to receive a one-time password.</Typography>
            <Box component="form" onSubmit={handleSubmit(submit)} noValidate sx={{ mt: 3 }}>
              {requestError && <Alert severity="error" sx={{ mb: 2 }}>{requestError}</Alert>}
              <Controller name="role" control={control} render={({ field }) => <FormControl fullWidth disabled={otpSent || pending} error={Boolean(errors.role)}><InputLabel id="role-label">Access type</InputLabel><Select {...field} labelId="role-label" label="Access type">{(Object.keys(roleNames) as UserRole[]).map((role) => <MenuItem key={role} value={role}>{roleNames[role]}</MenuItem>)}</Select><FormHelperText>{errors.role?.message}</FormHelperText></FormControl>} />
              <Controller name="mobile" control={control} render={({ field }) => <TextField {...field} label="Mobile number" fullWidth disabled={otpSent || pending} error={Boolean(errors.mobile)} helperText={errors.mobile?.message || 'We will send a secure OTP to this number.'} slotProps={{ input: { startAdornment: <PhoneAndroidOutlined color="action" sx={{ mr: 1 }} /> } }} sx={{ mt: 2.1 }} />} />
              {otpSent && <><Alert severity="info" sx={{ mt: 2 }}>{requestMessage || 'An OTP has been sent to your registered mobile number.'}{developmentCode && <> Development OTP: <strong>{developmentCode}</strong></>}</Alert><Controller name="otp" control={control} render={({ field }) => <TextField {...field} label="OTP" fullWidth autoFocus disabled={pending} inputProps={{ inputMode: 'numeric', maxLength: 8 }} error={Boolean(errors.otp)} helperText={errors.otp?.message || 'Enter the code you received.'} sx={{ mt: 2.1 }} />} /></>}
              <Button type="submit" variant="contained" size="large" fullWidth disabled={pending} sx={{ mt: 2.6 }} startIcon={otpSent ? <LockOutlined /> : <PhoneAndroidOutlined />}>{pending ? (otpSent ? 'Verifying…' : 'Sending OTP…') : otpSent ? 'Verify and continue' : 'Send OTP'}</Button>
              {otpSent && <Button type="button" fullWidth disabled={pending} onClick={() => { setOtpSent(false); setRequestMessage(null); setDevelopmentCode(null); setRequestError(null); setValue('otp', ''); }} sx={{ mt: 1 }}>Change mobile number</Button>}
            </Box>
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 2.4, lineHeight: 1.55 }}>By continuing, you consent to receive welfare-related updates on your registered mobile number.</Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
