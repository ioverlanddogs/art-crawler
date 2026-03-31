import { AlertBanner, PageHeader, SectionCard, StatusBadge } from '@/components/admin';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type ParsedEvent = {
  id: string;
  sourceId: string;
  event: string;
  reason: string | null;
  severity: string | null;
  fallbackChain: string[];
  createdAt: Date;
  actor: string | null;
  releaseEvidence: string | null;
};

function parseEvent(id: string, detail: string | null, createdAt: Date): ParsedEvent {
  if (!detail) {
    return {
      id,
      sourceId: 'unknown',
      event: 'unknown',
      reason: null,
      severity: null,
      fallbackChain: [],
      createdAt,
      actor: null,
      releaseEvidence: null
    };
  }

  try {
    const parsed = JSON.parse(detail) as {
      sourceId?: string;
      event?: string;
      reason?: string;
      severity?: string;
      fallbackChain?: string[];
      fallbackPlan?: string[];
      reversalReason?: string;
      action?: string;
      releaseEvidence?: string;
    };

    return {
      id,
      sourceId: parsed.sourceId ?? 'unknown',
      event: parsed.event ?? 'unknown',
      reason: parsed.reason ?? parsed.reversalReason ?? null,
      severity: parsed.severity ?? null,
      fallbackChain: parsed.fallbackChain ?? parsed.fallbackPlan ?? [],
      createdAt,
      actor: parsed.action ?? null,
      releaseEvidence: parsed.releaseEvidence ?? null
    };
  } catch {
    return {
      id,
      sourceId: 'unknown',
      event: 'unparsed',
      reason: detail,
      severity: null,
      fallbackChain: [],
      createdAt,
      actor: null,
      releaseEvidence: null
    };
  }
}

export default async function SelfHealingPage() {
  const telemetry = await prisma.pipelineTelemetry.findMany({
    where: { stage: 'self_heal' },
    orderBy: { createdAt: 'desc' },
    take: 300
  });

  const events = telemetry.map((row) => parseEvent(row.id, row.detail, row.createdAt));

  const quarantined = events.filter((event) => event.event === 'source_quarantined');
  const pausedOrDeprioritized = events.filter((event) => event.event === 'source_paused' || event.event === 'source_deprioritized');
  const automaticRecovery = events.filter((event) => ['fallback_retry_used', 'fallback_parser_used', 'source_probe_run', 'fallback_chain_applied'].includes(event.event));
  const released = events.filter((event) => event.event === 'source_released');
  const reversals = events.filter((event) => event.event === 'false_quarantine_reversed');
  const overrides = reversals.concat(events.filter((event) => event.reason?.startsWith('manual_override:')));

  return (
    <div className="stack">
      <PageHeader
        title="Self-healing source reliability"
        description="Operational controls for source containment, fallback routing, release safety checks, and reversible interventions."
      />

      <SectionCard title="Quarantined sources" subtitle="Degraded sources with explicit reasons, severity, and fallback chain visibility.">
        {quarantined.length === 0 ? (
          <AlertBanner tone="info" title="No quarantined sources in current window">
            Quarantine events will appear here with reasons and recommended follow-up.
          </AlertBanner>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Reason(s)</th>
                <th>Severity</th>
                <th>When quarantined</th>
                <th>Current fallback chain</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {quarantined.map((event) => (
                <tr key={event.id}>
                  <td>{event.sourceId}</td>
                  <td>{event.reason ?? 'signal breach threshold reached'}</td>
                  <td>
                    <StatusBadge tone={event.severity === 'critical' ? 'danger' : event.severity === 'high' ? 'warning' : 'info'}>
                      {(event.severity ?? 'unknown').toUpperCase()}
                    </StatusBadge>
                  </td>
                  <td>{event.createdAt.toISOString()}</td>
                  <td>{event.fallbackChain.length ? event.fallbackChain.join(' → ') : 'fallback_chain_logged_separately'}</td>
                  <td>
                    <Link href={`/investigations?sourceUrl=${encodeURIComponent(event.sourceId)}`}>Investigate</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Automatic recovery activity" subtitle="Retries, fallback parser/extraction use, and source probes for containment.">
        <p className="muted">Events in view: {automaticRecovery.length}</p>
        <ul className="timeline">
          {automaticRecovery.slice(0, 30).map((event) => (
            <li key={event.id}>
              <strong>{event.event}</strong> · {event.sourceId} · {event.reason ?? 'no reason supplied'}
            </li>
          ))}
          {automaticRecovery.length === 0 ? <li className="muted">No automatic activity recorded yet.</li> : null}
        </ul>
      </SectionCard>

      <SectionCard title="Released/recovered sources" subtitle="Safe release records with evidence and confidence recovery signals.">
        <ul className="timeline">
          {released.slice(0, 20).map((event) => (
            <li key={event.id}>
              <strong>{event.sourceId}</strong> released · {event.reason ?? 'recovered_after_stable_window'} · evidence:{' '}
              {event.releaseEvidence ?? 'not_provided'}
            </li>
          ))}
          {released.length === 0 ? <li className="muted">No releases recorded yet.</li> : null}
        </ul>
      </SectionCard>

      <SectionCard title="False quarantine reversals" subtitle="Distinguishes manual/system reversals for audit continuity.">
        <ul className="timeline">
          {reversals.slice(0, 20).map((event) => (
            <li key={event.id}>
              <strong>{event.sourceId}</strong> · {event.reason ?? 'unspecified_reversal_reason'} · {event.actor ?? 'operator/system'}
            </li>
          ))}
          {reversals.length === 0 ? <li className="muted">No reversals in this window.</li> : null}
        </ul>
      </SectionCard>

      <SectionCard title="Manual override / intervention summary" subtitle="Operator interventions remain explicit, reversible, and investigation-linked.">
        <p>Paused/deprioritized actions: {pausedOrDeprioritized.length}</p>
        <p>Manual override or reversal actions: {overrides.length}</p>
        <p>
          Follow-up: <Link href="/investigations?stage=self_heal">Open investigation queue</Link>
        </p>
      </SectionCard>
    </div>
  );
}
