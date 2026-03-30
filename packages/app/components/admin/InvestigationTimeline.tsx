import { EmptyState } from './EmptyState';
import { StatusBadge } from './StatusBadge';

export type TimelineEvent = {
  id: string;
  stage: string;
  timestamp: Date;
  status: string;
  configVersion?: number | null;
  modelVersion?: string | null;
  candidateId?: string | null;
  importBatchId?: string | null;
  pipelineRunId?: string | null;
  notes?: string | null;
  missing?: boolean;
};

export function InvestigationTimeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) {
    return <EmptyState title="No timeline events" description="Telemetry is missing for this object in the current data slice." />;
  }

  return (
    <ol className="timeline investigation-timeline" aria-label="Lifecycle timeline">
      {events.map((event) => {
        const tone =
          event.status === 'success' || event.status === 'APPROVED'
            ? 'success'
            : event.status === 'failure' || event.status === 'REJECTED'
              ? 'danger'
              : event.status === 'skip' || event.status === 'PARTIAL'
                ? 'warning'
                : 'info';

        return (
          <li key={event.id} tabIndex={0}>
            <p>
              <strong>{event.stage}</strong> <StatusBadge tone={tone}>{event.status}</StatusBadge>
            </p>
            <p className="muted">{event.timestamp.toLocaleString()}</p>
            <p className="kpi-note">
              Config v{event.configVersion ?? '—'} · Model {event.modelVersion ?? '—'} · Batch {event.importBatchId ?? '—'} · Candidate {event.candidateId ?? '—'}
            </p>
            {event.pipelineRunId ? <p className="kpi-note">Run: {event.pipelineRunId}</p> : null}
            <p className="muted">{event.notes ?? (event.missing ? 'Telemetry not captured for this lifecycle point.' : 'No additional notes.')}</p>
          </li>
        );
      })}
    </ol>
  );
}
