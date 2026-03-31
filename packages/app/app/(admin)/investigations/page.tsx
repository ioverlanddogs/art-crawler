import {
  AlertBanner,
  ExceptionQueueTable,
  ExplainabilityPanel,
  InvestigationSearch,
  InvestigationSummary,
  InvestigationTimeline,
  PageHeader,
  SectionCard
} from '@/components/admin';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type InvestigationParams = {
  candidateId?: string;
  importBatchId?: string;
  sourceUrl?: string;
  fingerprint?: string;
  stage?: string;
  error?: string;
};

type CandidateRow = Awaited<ReturnType<typeof prisma.ingestExtractedEvent.findFirst>>;
type BatchRow = Awaited<ReturnType<typeof prisma.importBatch.findFirst>>;
type TelemetryRow = Awaited<ReturnType<typeof prisma.pipelineTelemetry.findMany>>[number];
type TimelineEvent = ReturnType<typeof buildTimeline>[number];

export default async function InvestigationsPage({ searchParams }: { searchParams?: InvestigationParams }) {
  const filters = {
    candidateId: sanitize(searchParams?.candidateId),
    importBatchId: sanitize(searchParams?.importBatchId),
    sourceUrl: sanitize(searchParams?.sourceUrl),
    fingerprint: sanitize(searchParams?.fingerprint),
    stage: sanitize(searchParams?.stage),
    error: sanitize(searchParams?.error)
  };

  const telemetryWhere = {
    ...(filters.stage ? { stage: { contains: filters.stage, mode: 'insensitive' as const } } : {}),
    ...(filters.error ? { detail: { contains: filters.error, mode: 'insensitive' as const } } : {}),
    ...(filters.candidateId ? { entityId: filters.candidateId } : {}),
    createdAt: { gte: inLast7Days() }
  };

  const [candidate, batch, telemetryRows] = await Promise.all([
    safeQuery<CandidateRow | null>(
      () =>
        prisma.ingestExtractedEvent.findFirst({
          where: {
            ...(filters.candidateId ? { id: filters.candidateId } : {}),
            ...(filters.importBatchId ? { importBatchId: filters.importBatchId } : {}),
            ...(filters.sourceUrl ? { sourceUrl: { contains: filters.sourceUrl, mode: 'insensitive' } } : {}),
            ...(filters.fingerprint ? { fingerprint: filters.fingerprint } : {})
          },
          orderBy: { createdAt: 'desc' }
        }),
      null
    ),
    safeQuery<BatchRow | null>(
      () =>
        filters.importBatchId
          ? prisma.importBatch.findFirst({ where: { id: filters.importBatchId } })
          : prisma.importBatch.findFirst({ where: filters.candidateId ? { events: { some: { id: filters.candidateId } } } : undefined }),
      null
    ),
    safeQuery<TelemetryRow[]>(() => prisma.pipelineTelemetry.findMany({ where: telemetryWhere, orderBy: { createdAt: 'desc' }, take: 80 }), [])
  ]);

  const linkedTelemetry = telemetryRows.filter((row: TelemetryRow) => {
    if (candidate?.id && row.entityId === candidate.id) return true;
    if (batch?.id && row.entityId === batch.id) return true;
    if (filters.stage && row.stage.toLowerCase().includes(filters.stage.toLowerCase())) return true;
    if (filters.error && (row.detail ?? '').toLowerCase().includes(filters.error.toLowerCase())) return true;
    return !candidate && !batch;
  });

  const lifecycleStages = ['discovered', 'fetched', 'extracted', 'normalized', 'scored', 'deduplicated', 'exported', 'imported', 'moderated'];

  const timeline = buildTimeline({
    candidate,
    batch,
    telemetry: linkedTelemetry,
    lifecycleStages
  });

  const failureCount = linkedTelemetry.filter((row: TelemetryRow) => row.status === 'failure').length;
  const retryCount = linkedTelemetry.reduce((acc: number, row: TelemetryRow) => acc + (numberFromMetadata(row.metadata, 'retryCount') ?? 0), 0);
  const rejectionCount = candidate?.status === 'REJECTED' ? 1 : 0;
  const hasFilters = Object.values(filters).some(Boolean);

  const exceptionItems = linkedTelemetry
    .filter((row: TelemetryRow) => row.status === 'failure' || (row.detail ?? '').toLowerCase().includes('conflict'))
    .slice(0, 15)
    .map((row: TelemetryRow) => ({
      id: row.id,
      title: row.stage,
      reason: row.detail ?? 'No escalation detail captured',
      escalationType: (row.status === 'failure' ? 'unsupported_case' : 'conflict') as
        | 'policy_miss'
        | 'low_confidence'
        | 'conflict'
        | 'unsupported_case'
        | 'unknown',
      confidenceBand: candidate?.confidenceBand ?? 'unknown',
      nextAction: 'Review timeline entry and handoff to moderation with explicit override reason.'
    }));


  return (
    <div className="stack">
      <PageHeader
        title="Investigations"
        description="Trace what happened to a candidate or batch across pipeline lifecycle events."
      />

      <SectionCard title="Search and filters" subtitle="Deep-linkable query params drive this page and are preserved by browser back/forward.">
        <InvestigationSearch filters={filters} />
        <p className="kpi-note">
          For source-level quarantine and fallback controls, use the <Link href="/self-healing">Self-healing console</Link>.
        </p>
      </SectionCard>

      {!hasFilters ? (
        <AlertBanner tone="info" title="Empty state">
          Enter a candidate ID, batch ID, source URL, fingerprint, stage, or error to start a targeted trace.
        </AlertBanner>
      ) : failureCount > 0 ? (
        <AlertBanner tone="danger" title="Blocking/partial failure context detected">
          {failureCount} failures found in the current trace window. Review timeline events and failure notes before moderating.
        </AlertBanner>
      ) : timeline.some((item: TimelineEvent) => item.missing) ? (
        <AlertBanner tone="warning" title="Partial telemetry coverage">
          Some lifecycle events are missing. The timeline marks missing telemetry explicitly.
        </AlertBanner>
      ) : (
        <AlertBanner tone="success" title="Recovered or healthy trace window">
          No active failures in returned events.
        </AlertBanner>
      )}

      <SectionCard title="Trace summary" subtitle="Best available context for candidate/batch, including config and model versions.">
        <InvestigationSummary
          summary={
            candidate || batch
              ? {
                  candidateId: candidate?.id ?? filters.candidateId,
                  importBatchId: batch?.id ?? candidate?.importBatchId ?? filters.importBatchId,
                  sourceUrl: candidate?.sourceUrl,
                  fingerprint: candidate?.fingerprint,
                  status: candidate?.status,
                  confidenceScore: candidate?.confidenceScore,
                  configVersion: candidate?.configVersion,
                  modelVersion: telemetryRows.find((row: TelemetryRow) => row.stage === 'score')?.detail?.match(/model[:= ]([^,;]+)/i)?.[1] ?? null,
                  failureCount,
                  retryCount,
                  conflictOrRejectCount: rejectionCount + linkedTelemetry.filter((row: TelemetryRow) => (row.detail ?? '').toLowerCase().includes('conflict')).length
                }
              : null
          }
        />
      </SectionCard>

      <SectionCard title="Lifecycle timeline" subtitle="Keyboard navigable event history with explicit missing-data labels.">
        <InvestigationTimeline events={timeline} />
      </SectionCard>

      <div className="two-col">
        <SectionCard title="Exception routing" subtitle="Escalated failures and conflicts requiring operator decision.">
          <ExceptionQueueTable rows={exceptionItems} onSelect={() => undefined} />
          <AlertBanner tone="info" title="Policy miss visibility">
            This queue is derived from failure/conflict telemetry only. If rule-level miss reasons are absent, entries are labeled with partial context.
          </AlertBanner>
        </SectionCard>

        <SectionCard title="Escalation explainability" subtitle="Plain-language trust cues for escalation boundaries.">
          <ExplainabilityPanel
            title="Why work was escalated"
            summary="Escalation is triggered by failures, conflicts, or missing lifecycle telemetry in this trace window."
            matchedCriteria={[
              `${failureCount} failure event(s) in current trace`,
              `${timeline.filter((item: TimelineEvent) => item.missing).length} missing lifecycle stage(s)`,
              `${linkedTelemetry.filter((row: TelemetryRow) => (row.detail ?? '').toLowerCase().includes('conflict')).length} conflict marker(s)`
            ]}
            thresholdContext="Confidence thresholds may not be present in investigation telemetry. Missing thresholds are treated as partial context."
            boundaryCopy="When escalation reason is incomplete, human review is mandatory before returning the case to normal automation flow."
          />
        </SectionCard>
      </div>

    </div>
  );
}

function sanitize(value?: string) {
  const next = value?.trim();
  return next ? next : undefined;
}

function numberFromMetadata(metadata: unknown, key: string): number | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : null;
}

function stageAlias(rawStage: string) {
  const stage = rawStage.toLowerCase();
  if (stage === 'fetch') return 'fetched';
  if (stage === 'extract') return 'extracted';
  if (stage === 'normalise') return 'normalized';
  if (stage === 'score') return 'scored';
  if (stage === 'deduplicate') return 'deduplicated';
  if (stage === 'import') return 'imported';
  if (stage === 'export') return 'exported';
  if (stage === 'discovery') return 'discovered';
  return stage;
}

function buildTimeline({
  candidate,
  batch,
  telemetry,
  lifecycleStages
}: {
  candidate: CandidateRow;
  batch: BatchRow;
  telemetry: TelemetryRow[];
  lifecycleStages: string[];
}) {
  const events: Array<{
    id: string;
    stage: string;
    timestamp: Date;
    status: string;
    configVersion: number | null;
    modelVersion: string | null;
    candidateId: string | null | undefined;
    importBatchId: string | null;
    pipelineRunId: string | null;
    notes: string | null;
    missing: boolean;
  }> = telemetry.map((row: TelemetryRow) => ({
    id: row.id,
    stage: stageAlias(row.stage),
    timestamp: row.createdAt,
    status: row.status,
    configVersion: row.configVersion,
    modelVersion: null,
    candidateId: candidate?.id ?? (row.entityType === 'candidate' ? row.entityId : null),
    importBatchId: batch?.id ?? null,
    pipelineRunId: row.pipelineRunId,
    notes: row.detail,
    missing: false
  }));

  if (candidate) {
    events.push({
      id: `candidate-${candidate.id}`,
      stage: 'discovered',
      timestamp: candidate.createdAt,
      status: candidate.status,
      configVersion: candidate.configVersion,
      modelVersion: null,
      candidateId: candidate.id,
      importBatchId: candidate.importBatchId,
      pipelineRunId: null,
      notes: `Candidate record created from source ${candidate.source}.`,
      missing: false
    });

    if (candidate.moderatedAt) {
      events.push({
        id: `moderated-${candidate.id}`,
        stage: 'moderated',
        timestamp: candidate.moderatedAt,
        status: candidate.status,
        configVersion: candidate.configVersion,
        modelVersion: null,
        candidateId: candidate.id,
        importBatchId: candidate.importBatchId,
        pipelineRunId: null,
        notes: candidate.rejectionReason ?? `Moderated by ${candidate.moderatedBy ?? 'unknown'}`,
        missing: false
      });
    }
  }

  if (batch) {
    events.push({
      id: `batch-${batch.id}`,
      stage: 'imported',
      timestamp: batch.createdAt,
      status: batch.status,
      configVersion: null,
      modelVersion: null,
      candidateId: candidate?.id ?? null,
      importBatchId: batch.id,
      pipelineRunId: null,
      notes: `Batch imported=${batch.importedCount}, errors=${batch.errorCount}, skipped=${batch.skippedCount}`,
      missing: false
    });
  }

  const covered = new Set(events.map((event) => event.stage));
  for (const stage of lifecycleStages) {
    if (!covered.has(stage)) {
      events.push({
        id: `missing-${stage}`,
        stage,
        timestamp: new Date(0),
        status: 'MISSING',
        configVersion: null,
        modelVersion: null,
        candidateId: candidate?.id ?? null,
        importBatchId: batch?.id ?? candidate?.importBatchId ?? null,
        pipelineRunId: null,
        notes: null,
        missing: true
      });
    }
  }

  return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

async function safeQuery<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch {
    return fallback;
  }
}

function inLast7Days() {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}
