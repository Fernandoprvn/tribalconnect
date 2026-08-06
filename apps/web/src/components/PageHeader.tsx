import { Box, Breadcrumbs, Button, Stack, Typography, useMediaQuery, useTheme } from '@mui/material';
import { NavigateNext } from '@mui/icons-material';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
}

export function PageHeader({ title, description, eyebrow, action }: PageHeaderProps) {
  const theme = useTheme();
  const compact = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2.25} alignItems={{ sm: 'flex-start' }} sx={{ mb: 3.25 }}>
      <Box>
        {eyebrow && (
          <Breadcrumbs separator={<NavigateNext fontSize="small" />} aria-label="breadcrumb" sx={{ mb: .65, color: 'text.secondary' }}>
            <Typography variant="caption" fontWeight={800} color="primary.main">{eyebrow}</Typography>
            <Typography variant="caption" color="text.secondary">{title}</Typography>
          </Breadcrumbs>
        )}
        <Typography variant={compact ? 'h4' : 'h3'}>{title}</Typography>
        {description && <Typography color="text.secondary" sx={{ mt: .6, maxWidth: 680 }}>{description}</Typography>}
      </Box>
      {action && <Box sx={{ width: { xs: '100%', sm: 'auto' }, '& > *': { width: { xs: '100%', sm: 'auto' } } }}>{action}</Box>}
    </Stack>
  );
}

export function HeaderAction({ children, onClick, variant = 'contained', startIcon }: { children: ReactNode; onClick?: () => void; variant?: 'contained' | 'outlined' | 'text'; startIcon?: ReactNode }) {
  return <Button variant={variant} onClick={onClick} startIcon={startIcon}>{children}</Button>;
}
