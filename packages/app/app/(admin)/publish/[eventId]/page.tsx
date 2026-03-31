import { notFound } from 'next/navigation';
import { PageHeader, SectionCard } from '@/components/admin';
import { prisma } from '@/lib/db';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';
import { ConfirmPublishPanel } from './ConfirmPublishPanel';

export const dynamic = 'force-dynamic';

export default async function PublishDetailPage({ params }: { params: { eventId: string } }) {
  const event = await prisma.event.findUnique({ where: { id: params.eventId } });
  if (!event) notFound();

  const changeSet = await prisma.proposedChangeSet.findFirst({
    where: { matchedEventId: event.id, reviewStatus: 'approved' },
    include: { fieldReviews: true, extractionRun: true },
    orderBy: { reviewedAt: 'desc' }
  });

  if (!changeSet) notFound();

  const diffJson = asRecord(changeSet.diffJson);
  const changedFields = Object.keys(diffJson);
  const evidenceCoverage = Object.keys(asRecord(changeSet.extractionRun?.evidenceJson)).length;

  const publishGate = checkPublishReadiness({
    proposedDataJson: asRecord(changeSet.proposedDataJson),
    fieldReviews: changeSet.fieldReviews
  });

  return (
    <div className="stack">
      <PageHeader title="Confirm publish" description="Review readiness checks before releasing this event." />

      <SectionCard title={event.title} subtitle={`Event ID: ${event.id}`}>
        <p className="muted">
          Evidence coverage: <strong>{evidenceCoverage}</strong> field(s) with extraction evidence.
        </p>
      </SectionCard>

      <SectionCard title="Changed fields">
        {changedFields.length === 0 ? (
          <p className="muted">No explicit diff fields recorded.</p>
        ) : (
          <ul className="timeline">
            {changedFields.map((field) => (
              <li key={field}>
                <code>{field}</code>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Readiness warnings">
        {publishGate.warnings.length === 0 ? <p className="muted">No risk warnings.</p> : null}
        {publishGate.warnings.length > 0 ? (
          <ul className="timeline">
            {publishGate.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </SectionCard>

      <ConfirmPublishPanel eventId={event.id} blockers={publishGate.blockers} warnings={publishGate.warnings} />
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
