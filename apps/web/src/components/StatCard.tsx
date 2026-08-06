import { ArrowDownward, ArrowUpward } from '@mui/icons-material';
import { Box, Card, CardContent, Stack, Typography, alpha, useTheme } from '@mui/material';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  color?: string;
  change?: string;
  direction?: 'up' | 'down' | 'neutral';
  helper?: string;
}

export function StatCard({ label, value, icon, color, change, direction = 'up', helper }: StatCardProps) {
  const theme = useTheme();
  const tone = color ?? theme.palette.primary.main;
  return (
    <Card variant="outlined" sx={{ height: '100%', transition: 'transform .2s, box-shadow .2s', '&:hover': { transform: 'translateY(-3px)', boxShadow: '0 14px 30px rgba(17,60,43,.10)' } }}>
      <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={650}>{label}</Typography>
            <Typography variant="h4" sx={{ mt: .6, lineHeight: 1.1 }}>{value}</Typography>
          </Box>
          <Box sx={{ color: tone, bgcolor: alpha(tone, .12), width: 42, height: 42, borderRadius: 3, display: 'grid', placeItems: 'center' }}>{icon}</Box>
        </Stack>
        {(change || helper) && (
          <Stack direction="row" spacing={.65} alignItems="center" sx={{ mt: 1.65 }}>
            {change && direction !== 'neutral' && (direction === 'up' ? <ArrowUpward sx={{ fontSize: 15, color: '#18864B' }} /> : <ArrowDownward sx={{ fontSize: 15, color: 'error.main' }} />)}
            {change && <Typography variant="caption" fontWeight={800} color={direction === 'down' ? 'error.main' : direction === 'neutral' ? 'text.secondary' : '#18864B'}>{change}</Typography>}
            {helper && <Typography variant="caption" color="text.secondary">{helper}</Typography>}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
