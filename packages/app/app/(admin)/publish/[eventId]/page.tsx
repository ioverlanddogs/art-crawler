import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, SectionCard } from '@/components/admin';
import { prisma } from '@/lib/db';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';
import { ConfirmPublishPanel } from './ConfirmPublishPanel';
import { RollbackPreviewPanel } from './RollbackPreviewPanel';

export const dynamic = 'force-dynamic';

export default async function PublishDetailPage({ params }: { params: { eventId: string } }) {
  const event = await prisma.event.findUnique({ where: { id: params.eventId } });
  if (!event) notFound();

  const [changeSet, versions] = await Promise.all([
    prisma.proposedChangeSet.findFirst({
      where: { matchedEventId: event.id, reviewStatus: 'approved' },
      include: { fieldReviews: true, extractionRun: true, duplicateCandidates: true },
      orderBy: { reviewedAt: 'desc' }
    }),
    prisma.canonicalRecordVersion.findMany({ where: { eventId: event.id }, orderBy: { versionNumber: 'desc' }, take: 10 })
  ]);

  if (!changeSet) notFound();

  const diffJson = asRecord(changeSet.diffJson);
  const changedFields = Object.keys(diffJson).map((fieldPath) => {
    const record = asRecord(diffJson[fieldPath]);
    return { fieldPath, previous: record.from ?? null, next: record.to ?? null };
  });
  const evidenceCoverage = Object.keys(asRecord(changeSet.extractionRun?.evidenceJson)).length;

  const publishGate = checkPublishReadiness({
    proposedDataJson: asRecord(changeSet.proposedDataJson),
    fieldReviews: changeSet.fieldReviews,
    duplicateCandidates: changeSet.duplicateCandidates
  });

  return (
    <div className="stack">
      <PageHeader title="Confirm publish" description="Review readiness checks before releasing this event." />

      <SectionCard title={event.title} subtitle={`Event ID: ${event.id}`}>
        <p className="muted">Evidence coverage: <strong>{evidenceCoverage}</strong> field(s) with extraction evidence.</p>
        <p className="muted">Reviewer: <strong>{changeSet.reviewedByUserId ?? 'Unknown'}</strong> · {changeSet.reviewedAt?.toLocaleString() ?? 'Not timestamped'}</p>
        <div className="filters-row">
          <Link href={`/audit?entityType=Event&entityId=${encodeURIComponent(event.id)}`} className="action-button variant-secondary">Open audit trail</Link>
          <Link href="/publish" className="action-button variant-secondary">Back to queue</Link>
        </div>
      </SectionCard>

      <SectionCard title="Changed fields">
        {changedFields.length === 0 ? (
          <p className="muted">No explicit diff fields recorded.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Current</th>
                <th>Proposed</th>
              </tr>
            </thead>
            <tbody>
              {changedFields.map((field) => (
                <tr key={field.fieldPath}>
                  <td><code>{field.fieldPath}</code></td>
                  <td>{String(field.previous ?? '—')}</td>
                  <td>{String(field.next ?? '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title="Readiness warnings + blockers">
        {publishGate.blockers.length ? <ul className="tone-danger alert-banner">{publishGate.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : <p className="tone-success alert-banner">No blockers.</p>}
        {publishGate.warnings.length ? <ul className="tone-warning alert-banner">{publishGate.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
        {changeSet.duplicateCandidates.some((candidate) => candidate.resolutionStatus === 'unresolved') ? (
          <p className="muted">
            Duplicate/corroboration resolution is still open.{' '}
            <Link href="/duplicates" className="inline-link">
              Open duplicates queue
            </Link>
            .
          </p>
        ) : null}
      </SectionCard>

      <RollbackPreviewPanel eventId={event.id} versions={versions.map((v) => ({ versionNumber: v.versionNumber, createdAt: v.createdAt.toISOString(), changeSummary: v.changeSummary }))} />

      <ConfirmPublishPanel eventId={event.id} blockers={publishGate.blockers} warnings={publishGate.warnings} />
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
