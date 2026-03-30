import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Legacy route removed. Use /api/admin/moderation/events/[id]/reject.' },
    { status: 410 }
  );
}
