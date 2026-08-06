import { Chip } from '@mui/material';
import type { WorkflowStatus } from '../types';

const workflowTone: Record<WorkflowStatus, { label: string; bg: string; color: string }> = {
  Submitted: { label: 'Submitted', bg: '#EAF0FF', color: '#365CA8' },
  Verification: { label: 'Verification', bg: '#FFF4D8', color: '#9A6700' },
  'Field visit': { label: 'Field visit', bg: '#E7F6F5', color: '#146B6A' },
  Approved: { label: 'Approved', bg: '#DDF4E5', color: '#176B3A' },
  Applied: { label: 'Applied', bg: '#EEE9FF', color: '#6547AA' },
  'Benefit received': { label: 'Benefit received', bg: '#D4F0E7', color: '#075D44' },
  Rejected: { label: 'Rejected', bg: '#FDE7E5', color: '#B54743' },
};

export function StatusChip({ status, size = 'small' }: { status: WorkflowStatus; size?: 'small' | 'medium' }) {
  const tone = workflowTone[status];
  return <Chip label={tone.label} size={size} sx={{ bgcolor: tone.bg, color: tone.color, borderRadius: 2, '& .MuiChip-label': { px: 1.15 } }} />;
}

export function SchemeStatusChip({ status }: { status: 'Active' | 'Closing soon' | 'Paused' }) {
  const tone = status === 'Active' ? { bg: '#DDF4E5', color: '#176B3A' } : status === 'Closing soon' ? { bg: '#FFF4D8', color: '#9A6700' } : { bg: '#EDF0F2', color: '#5E6E68' };
  return <Chip label={status} size="small" sx={{ bgcolor: tone.bg, color: tone.color, borderRadius: 2 }} />;
}
