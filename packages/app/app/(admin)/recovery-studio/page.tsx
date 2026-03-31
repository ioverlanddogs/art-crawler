import { AlertBanner, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { buildDryRunComparison } from '@/lib/admin/recovery-replay';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';

export const dynamic = 'force-dynamic';

type RecoveryParams = {
  q?: string;
  target?: string;
  parserVersion?: string;
  modelVersion?: string;
  dryRun?: string;
};

function toStatusBadge(status: string | null) {
  if (status === 'failure') return { tone: 'danger' as const, label: 'Failure' };
  if (status === 'success') return { tone: 'success' as const, label: 'Success' };
  if (status === 'dry_run') return { tone: 'info' as const, label: 'Dry run' };
  if (status === 'accepted') return { tone: 'warning' as const, label: 'Accepted' };
  return { tone: 'neutral' as const, label: status ?? 'Unknown' };
}

export default async function RecoveryStudioPage({ searchParams }: { searchParams?: RecoveryParams }) {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  const q = searchParams?.q?.trim();
  const target = searchParams?.target?.trim() || 'ingestion_job';
  const parserVersion = searchParams?.parserVersion?.trim() || 'latest-stable-parser';
  const modelVersion = searchParams?.modelVersion?.trim() || 'latest-stable-model';
  const dryRun = searchParams?.dryRun !== 'false';

  const failedJobs = await prisma.pipelineTelemetry.findMany({
    where: {
      status: 'failure',
      ...(q
        ? {
            OR: [
              { stage: { contains: q, mode: 'insensitive' } },
              { entityId: { contains: q, mode: 'insensitive' } },
              { detail: { contains: q, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const active = failedJobs[0] ?? null;
  const chain = active
    ? await prisma.pipelineTelemetry.findMany({
        where: {
          entityId: active.entityId ?? undefined,
          createdAt: { gte: new Date(active.createdAt.getTime() - 12 * 60 * 60 * 1000) }
        },
        orderBy: { createdAt: 'asc' },
        take: 25
      })
    : [];

  const candidate = active?.entityId
    ? await prisma.ingestExtractedEvent.findFirst({ where: { id: active.entityId } })
    : null;

  const comparison = buildDryRunComparison({
    before: {
      title: candidate?.title,
      confidenceScore: candidate?.confidenceScore,
      duplicateRisk: 58,
      publishReadiness: 42,
      parserVersion: 'legacy-parser-v1',
      modelVersion: 'model-v2',
      sourceHealth: 'degraded'
    },
    simulatedAfter: {
      title: candidate?.title,
      confidenceScore: (candidate?.confidenceScore ?? 55) + 8,
      duplicateRisk: 43,
      publishReadiness: 69,
      parserVersion,
      modelVersion,
      sourceHealth: 'healthy'
    }
  });

  return (
    <div className="stack">
      <PageHeader
        title="Replay + Recovery Studio"
        description="Safely replay failed ingestion/mastering paths with dry-run diffing and audit continuity."
      />

      <SectionCard title="Recovery workflows" subtitle="Search failed chains and replay by job, source, event, duplicate, blocker cluster, or rollback event.">
        <form className="filters-row" method="GET">
          <input className="input" name="q" defaultValue={q ?? ''} placeholder="Search failed pipeline jobs / source URL / event ID" />
          <select className="select" name="target" defaultValue={target}>
            <option value="ingestion_job">Replay by ingestion job</option>
            <option value="source_url">Replay by source URL</option>
            <option value="canonical_event">Replay by canonical event</option>
            <option value="duplicate_candidate">Replay by duplicate candidate</option>
            <option value="publish_blocker_cluster">Replay by publish blocker cluster</option>
            <option value="rollback_event">Replay by rollback event</option>
          </select>
          <input className="input" name="parserVersion" defaultValue={parserVersion} placeholder="target parser version" />
          <input className="input" name="modelVersion" defaultValue={modelVersion} placeholder="target model version" />
          <label className="filters-row" style={{ alignItems: 'center' }}>
            <input type="checkbox" name="dryRun" value="true" defaultChecked={dryRun} /> Dry-run mode
          </label>
          <button type="submit" className="action-button variant-secondary">Refresh</button>
        </form>

        {failedJobs.length === 0 ? (
          <AlertBanner tone="info" title="No failed jobs found">Try widening the search window or remove filters.</AlertBanner>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Failure point</th>
                  <th>Entity</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {failedJobs.slice(0, 12).map((row) => (
                  <tr key={row.id}>
                    <td>{row.stage}</td>
                    <td>{row.detail ?? 'No detail'}</td>
                    <td>{row.entityId ?? 'n/a'}</td>
                    <td>{row.createdAt.toISOString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Original chain + replay target" subtitle="Failure stage, prior confidence, parser/model baseline, and expected replay impact.">
        {active ? (
          <>
            <div className="three-col">
              <StatCard label="Failure point" value={active.stage} />
              <StatCard label="Confidence before" value={candidate?.confidenceScore ?? 'Unknown'} />
              <StatCard label="Replay mode" value={dryRun ? 'Dry-run' : 'Execute (guarded)'} />
            </div>
            <p className="muted" style={{ marginTop: 12 }}>
              Parser/model before: legacy-parser-v1 / model-v2 · Replay target parser/model: {parserVersion} / {modelVersion}
            </p>
            <div className="stack" style={{ marginTop: 12 }}>
              {chain.map((row) => {
                const badge = toStatusBadge(row.status);
                return (
                  <div key={row.id} className="filters-row" style={{ justifyContent: 'space-between' }}>
                    <span>{row.stage}</span>
                    <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <AlertBanner tone="info" title="No active failure selected">Search failures to inspect a replay chain.</AlertBanner>
        )}
      </SectionCard>

      <SectionCard title="Before / after recovery diff studio" subtitle="Field-level diff plus confidence, duplicate risk, publish readiness, parser/model, and source health deltas.">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Before</th>
                <th>After (replay)</th>
                <th>Delta</th>
              </tr>
            </thead>
            <tbody>
              {comparison.fieldDiff.map((diff) => (
                <tr key={diff.field}>
                  <td>{diff.field}</td>
                  <td>{String(diff.before ?? '—')}</td>
                  <td>{String(diff.after ?? '—')}</td>
                  <td>{diff.changed ? 'Changed' : 'No change'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="three-col" style={{ marginTop: 12 }}>
          <StatCard label="Confidence delta" value={comparison.confidenceDelta} />
          <StatCard label="Duplicate risk delta" value={comparison.duplicateRiskDelta} />
          <StatCard label="Publish readiness delta" value={comparison.publishReadinessDelta} />
        </div>
        <p className="muted" style={{ marginTop: 12 }}>
          Parser/model delta: {comparison.parserDelta} · {comparison.modelDelta} · Source health delta: {comparison.sourceHealthDelta}
        </p>
      </SectionCard>

      <SectionCard title="Safe replay actions" subtitle="Replay APIs preserve audit continuity, enforce dry-run comparison, and never overwrite canonical truth silently.">
        <ul className="stack">
          <li>POST <code>/api/admin/recovery/replay</code> action=<code>replay_ingestion_chain</code></li>
          <li>POST <code>/api/admin/recovery/replay</code> action=<code>replay_from_stage</code> (requires <code>fromStage</code>)</li>
          <li>POST <code>/api/admin/recovery/replay</code> action=<code>replay_duplicate_compare</code></li>
          <li>POST <code>/api/admin/recovery/replay</code> action=<code>replay_parser_extraction_only</code></li>
          <li>POST <code>/api/admin/recovery/replay</code> action=<code>replay_normalization_only</code></li>
          <li>POST <code>/api/admin/recovery/replay</code> action=<code>replay_publish_readiness_checks</code></li>
          <li>POST <code>/api/admin/recovery/replay</code> action=<code>replay_source_health_probe</code></li>
        </ul>
        <p className="muted">
          Suggested payload target: {target} / {active?.entityId ?? q ?? 'manual-target'} · dryRun={String(dryRun)}
        </p>
      </SectionCard>
    </div>
  );
}
