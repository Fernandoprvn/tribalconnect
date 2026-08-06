import { ErrorOutline, InboxOutlined, RefreshOutlined } from '@mui/icons-material';
import { Box, Button, Paper, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Stack spacing={2.1} aria-label="Loading content" aria-busy="true">
      <Skeleton variant="rounded" height={46} width="42%" />
      <Skeleton variant="rounded" height={84} />
      {Array.from({ length: rows }, (_, index) => <Skeleton key={index} variant="rounded" height={92} />)}
    </Stack>
  );
}

interface StatePanelProps {
  title: string;
  description: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

function StatePanel({ title, description, icon, actionLabel, onAction }: StatePanelProps) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 3, py: { xs: 5, sm: 7 }, px: 2.5, textAlign: 'center' }}>
      <Box sx={{ color: 'primary.main', display: 'grid', placeItems: 'center', mb: 1.25 }}>{icon}</Box>
      <Typography variant="h6">{title}</Typography>
      <Typography color="text.secondary" sx={{ mt: .65, mx: 'auto', maxWidth: 440 }}>{description}</Typography>
      {actionLabel && onAction && <Button variant="outlined" startIcon={<RefreshOutlined />} onClick={onAction} sx={{ mt: 2.1 }}>{actionLabel}</Button>}
    </Paper>
  );
}

export function EmptyState({ title = 'Nothing to show yet', description, actionLabel, onAction }: Omit<StatePanelProps, 'icon'>) {
  return <StatePanel title={title} description={description} icon={<InboxOutlined sx={{ fontSize: 40 }} />} actionLabel={actionLabel} onAction={onAction} />;
}

export function ErrorState({ title = 'We could not load this information', description = 'Please check your connection and try again.', onRetry }: { title?: string; description?: string; onRetry?: () => void }) {
  return <StatePanel title={title} description={description} icon={<ErrorOutline sx={{ fontSize: 40 }} />} actionLabel={onRetry ? 'Try again' : undefined} onAction={onRetry} />;
}
