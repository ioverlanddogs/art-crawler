import { StatusBadge } from '@/components/admin';
import type { IngestionJobStatus } from '@/lib/prisma-client';

const STATUS_TONE: Record<IngestionJobStatus, 'info' | 'warning' | 'success' | 'danger'> = {
  queued: 'info',
  fetching: 'info',
  extracting: 'info',
  parsing: 'info',
  matching: 'info',
  needs_review: 'warning',
  approved: 'success',
  publishing: 'success',
  published: 'success',
  failed: 'danger'
};

export function IntakeJobStatusBadge({ status }: { status: IngestionJobStatus }) {
  return <StatusBadge tone={STATUS_TONE[status]}>{status}</StatusBadge>;
}
