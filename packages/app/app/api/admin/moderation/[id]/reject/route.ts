import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-guard';

export async function POST() {
  await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  return NextResponse.json(
    { error: 'Legacy route removed. Use /api/admin/moderation/events/[id]/reject.' },
    { status: 410 }
  );
}
