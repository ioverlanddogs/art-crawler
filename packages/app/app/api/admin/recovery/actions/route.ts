import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireRole } from '@/lib/auth-guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z.object({
  action: z.enum(['pause_imports', 'resume_imports', 'start_drain', 'stop_drain', 'request_replay', 'request_retry']),
  scope: z.enum(['candidate', 'batch', 'stage', 'system']),
  target: z.string().trim().min(3).max(200),
  reason: z.string().trim().min(8).max(500),
  confirmText: z.string().trim().optional()
});

const HIGH_SCOPE_ACTIONS = new Set(['pause_imports', 'resume_imports', 'start_drain', 'stop_drain', 'request_replay']);

function detail(params: Record<string, string | number | boolean | null | undefined>) {
  return Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('; ');
}

export async function POST(request: Request) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    if (error instanceof Response) {
      return NextResponse.json({ error: 'Forbidden' }, { status: error.status || 403 });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = schema.parse(await request.json());

  if (HIGH_SCOPE_ACTIONS.has(payload.action) && payload.confirmText !== 'RECOVER') {
    return NextResponse.json({ error: 'Typed confirmation token RECOVER is required for high-scope recovery actions.' }, { status: 400 });
  }

  let auditId: string | null = null;
  let outcome = 'success';
  let note = '';

  await prisma.$transaction(async (tx) => {
    if (payload.action === 'pause_imports' || payload.action === 'resume_imports') {
      await tx.siteSetting.upsert({
        where: { key: 'mining_import_enabled' },
        update: { value: payload.action === 'resume_imports' ? 'true' : 'false' },
        create: { key: 'mining_import_enabled', value: payload.action === 'resume_imports' ? 'true' : 'false' }
      });
      note = payload.action === 'resume_imports' ? 'Import visibility is now enabled.' : 'Import visibility is now paused.';
    }

    if (payload.action === 'start_drain' || payload.action === 'stop_drain') {
      await tx.siteSetting.upsert({
        where: { key: 'pipeline_drain_mode' },
        update: { value: payload.action === 'start_drain' ? 'true' : 'false' },
        create: { key: 'pipeline_drain_mode', value: payload.action === 'start_drain' ? 'true' : 'false' }
      });
      note = payload.action === 'start_drain' ? 'Drain mode enabled. Let in-flight work finish before replay.' : 'Drain mode disabled.';
    }

    if (payload.action === 'request_replay' || payload.action === 'request_retry') {
      outcome = 'accepted';
      note =
        payload.action === 'request_replay'
          ? 'Replay request captured for audit. Automatic replay execution is not available in this UI.'
          : 'Retry request captured for audit. Automatic stage retry is not available in this UI.';
    }

    const stageByAction: Record<(typeof payload)['action'], string> = {
      pause_imports: 'recovery_pause',
      resume_imports: 'recovery_resume',
      start_drain: 'recovery_drain_start',
      stop_drain: 'recovery_drain_stop',
      request_replay: 'recovery_replay_request',
      request_retry: 'recovery_retry_request'
    };

    const row = await tx.pipelineTelemetry.create({
      data: {
        stage: stageByAction[payload.action],
        status: outcome,
        detail: detail({
          actor: session.user.email ?? session.user.id,
          reason: payload.reason,
          scope: payload.scope,
          target: payload.target,
          action: payload.action
        }),
        metadata: {
          recoveryAction: payload.action,
          scope: payload.scope,
          target: payload.target,
          requiresManualExecution: payload.action === 'request_replay' || payload.action === 'request_retry'
        }
      }
    });

    auditId = row.id;
  });

  return NextResponse.json({ ok: true, auditId, outcome, note });
}
