import { authFailure, err } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { buildDryRunComparison, enforceReplaySafety, mapReplayActionToTelemetryStage, REPLAY_ACTIONS, REPLAY_TARGETS } from '@/lib/admin/recovery-replay';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().optional(),
  scope: z.enum(REPLAY_TARGETS).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

const replaySchema = z
  .object({
    action: z.enum(REPLAY_ACTIONS),
    targetType: z.enum(REPLAY_TARGETS),
    targetId: z.string().trim().min(2).max(250),
    reason: z.string().trim().min(8).max(500),
    dryRun: z.boolean().default(true),
    fromStage: z.enum(['discovery', 'fetch', 'extract', 'normalise', 'score', 'deduplicate', 'enrich', 'mature', 'export', 'import']).optional(),
    parserVersion: z.string().trim().max(100).optional(),
    modelVersion: z.string().trim().max(100).optional(),
    operatorConfirmation: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (value.action === 'replay_from_stage' && !value.fromStage) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'fromStage is required for replay_from_stage', path: ['fromStage'] });
    }
  });

export async function GET(request: Request) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const url = new URL(request.url);
  const parsed = querySchema.parse({
    q: url.searchParams.get('q') ?? undefined,
    scope: url.searchParams.get('scope') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined
  });

  const rows = await prisma.pipelineTelemetry.findMany({
    where: {
      status: 'failure',
      ...(parsed.scope ? { entityType: parsed.scope } : {}),
      ...(parsed.q
        ? {
            OR: [
              { detail: { contains: parsed.q, mode: 'insensitive' } },
              { entityId: { contains: parsed.q, mode: 'insensitive' } },
              { stage: { contains: parsed.q, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: { createdAt: 'desc' },
    take: parsed.limit ?? 25
  });

  return Response.json({ data: rows });
}

export async function POST(request: Request) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const payload = replaySchema.parse(await request.json());
  const safety = enforceReplaySafety(payload);

  if (safety.requiresOperatorConfirmation && !safety.confirmed) {
    return err('Non-dry-run replay requires explicit operator confirmation.', 'OPERATOR_CONFIRMATION_REQUIRED', 400);
  }

  const telemetryStage = mapReplayActionToTelemetryStage(payload.action);

  const dryRunComparison = buildDryRunComparison({
    before: {
      confidenceScore: 50,
      duplicateRisk: 55,
      publishReadiness: 45,
      parserVersion: 'baseline-parser',
      modelVersion: 'baseline-model',
      sourceHealth: 'degraded'
    },
    simulatedAfter: {
      confidenceScore: payload.action === 'replay_parser_extraction_only' ? 68 : 62,
      duplicateRisk: payload.action === 'replay_duplicate_compare' ? 40 : 50,
      publishReadiness: payload.action === 'replay_publish_readiness_checks' ? 70 : 52,
      parserVersion: payload.parserVersion ?? 'latest-stable-parser',
      modelVersion: payload.modelVersion ?? 'latest-stable-model',
      sourceHealth: payload.action === 'replay_source_health_probe' ? 'healthy' : 'degraded'
    }
  });

  const row = await prisma.pipelineTelemetry.create({
    data: {
      stage: telemetryStage,
      status: payload.dryRun ? 'dry_run' : 'accepted',
      entityType: payload.targetType,
      entityId: payload.targetId,
      detail: `${payload.action} requested by ${session.user.email ?? session.user.id}`,
      metadata: {
        replayAction: payload.action,
        fromStage: payload.fromStage ?? null,
        reason: payload.reason,
        dryRun: payload.dryRun,
        parserVersion: payload.parserVersion ?? null,
        modelVersion: payload.modelVersion ?? null,
        safeguards: safety.safeguards,
        canonicalWriteAllowed: safety.allowCanonicalWrite,
        comparison: dryRunComparison
      }
    }
  });

  return Response.json({
    ok: true,
    replayAuditId: row.id,
    safeguards: safety.safeguards,
    canonicalWriteAllowed: safety.allowCanonicalWrite,
    comparison: dryRunComparison,
    requiresManualPromotion: true
  });
}
