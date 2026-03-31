import { AlertBanner, PageHeader, SectionCard, StatusBadge } from '@/components/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type ActionRow = {
  id: string;
  sourceId: string;
  action: string;
  reason: string | null;
  createdAt: Date;
};

function parseDetail(detail: string | null): { sourceId: string; action: string; reason: string | null } {
  if (!detail) return { sourceId: 'unknown', action: 'unknown', reason: null };
  try {
    const parsed = JSON.parse(detail) as { sourceId?: string; action?: string; reason?: string };
    return {
      sourceId: parsed.sourceId ?? 'unknown',
      action: parsed.action ?? 'unknown',
      reason: parsed.reason ?? null
    };
  } catch {
    return { sourceId: 'unknown', action: 'unknown', reason: detail };
  }
}

export default async function SelfHealingPage() {
  const telemetry = await prisma.pipelineTelemetry.findMany({
    where: { stage: 'self_heal' },
    orderBy: { createdAt: 'desc' },
    take: 150
  });

  const actions: ActionRow[] = telemetry.map((row) => {
    const parsed = parseDetail(row.detail);
    return {
      id: row.id,
      sourceId: parsed.sourceId,
      action: parsed.action,
      reason: parsed.reason,
      createdAt: row.createdAt
    };
  });

  const quarantined = actions.filter((row) => row.action === 'auto_quarantine').length;
  const retries = actions.filter((row) => row.action === 'fallback_orchestration').length;
  const recovered = actions.filter((row) => row.action === 'release_quarantine').length;
  const overrides = actions.filter((row) => row.action === 'reverse_false_quarantine').length;

  return (
    <div className="stack">
      <PageHeader
        title="Self-healing source reliability"
        description="Adaptive controls automatically quarantine degraded sources, apply fallbacks, and track recoveries with override safety."
      />

      <SectionCard title="Action log summary" subtitle="Quarantines, retries/fallbacks, recoveries, and manual reversals are fully auditable.">
        <div className="three-col">
          <div><strong>Quarantined sources:</strong> {quarantined}</div>
          <div><strong>Automatic retries/fallbacks:</strong> {retries}</div>
          <div><strong>Recovered sources:</strong> {recovered}</div>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Manual overrides + false quarantine reversals: {overrides}
        </p>
      </SectionCard>

      <SectionCard title="Self-healing action feed" subtitle="Includes fallback parser usage, quarantine events, recoveries, and manual overrides.">
        {actions.length === 0 ? (
          <AlertBanner tone="info" title="No self-healing actions recorded yet">
            Trigger reliability checks from the mining service to populate this feed.
          </AlertBanner>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Source</th>
                  <th>Action</th>
                  <th>Reason / context</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.createdAt.toISOString()}</td>
                    <td>{row.sourceId}</td>
                    <td>{row.action}</td>
                    <td>{row.reason ?? '—'}</td>
                    <td>
                      <StatusBadge
                        status={row.action === 'auto_quarantine' ? 'error' : row.action === 'release_quarantine' ? 'success' : 'pending'}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
