import { notFound } from 'next/navigation';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import { computeDiff } from '@/lib/intake/compute-diff';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';
import { requireRole } from '@/lib/auth-guard';
import { WorkbenchClient } from './WorkbenchClient';
import { PromoteVenueAction } from './PromoteVenueAction';

export const dynamic = 'force-dynamic';

export default async function WorkbenchPage({ params }: { params: { changeSetId: string } }) {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  const session = await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  const changeSet = await prisma.proposedChangeSet.findUnique({
    where: { id: params.changeSetId },
    include: {
      fieldReviews: true,
      sourceDocument: true,
      extractionRun: true,
      matchedEvent: true,
      duplicateCandidates: true
    }
  });

  if (!changeSet) {
    notFound();
  }

  const proposedData = asRecord(changeSet.proposedDataJson);
  const canonicalData = changeSet.matchedEvent
    ? asRecord({
        title: changeSet.matchedEvent.title,
        startAt: changeSet.matchedEvent.startAt,
        endAt: changeSet.matchedEvent.endAt,
        timezone: changeSet.matchedEvent.timezone,
        location: changeSet.matchedEvent.location,
        description: changeSet.matchedEvent.description,
        sourceUrl: changeSet.matchedEvent.sourceUrl
      })
    : null;

  const [latestIngestionJob, reviewers] = await Promise.all([
    prisma.ingestionJob.findFirst({
    where: { sourceDocumentId: changeSet.sourceDocumentId },
    orderBy: { createdAt: 'desc' },
    select: { id: true }
    }),
    prisma.adminUser.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true, email: true }, orderBy: { email: 'asc' }, take: 100 })
  ]);

  return (
    <div>
      <WorkbenchClient
        initialData={{
          ...changeSet,
          proposedDataJson: proposedData,
          matchedEvent: canonicalData,
          diffResult: computeDiff(proposedData, canonicalData),
          extractionRun: changeSet.extractionRun
            ? {
                evidenceJson: asRecord(changeSet.extractionRun.evidenceJson)
              }
            : null,
          sourceDocument: {
            ...changeSet.sourceDocument,
            metadataJson: asRecord(changeSet.sourceDocument.metadataJson)
          },
          currentUserRole: session.user.role,
          notes: changeSet.notes ?? null,
          validationSummary: checkPublishReadiness({
            proposedDataJson: proposedData,
            fieldReviews: changeSet.fieldReviews,
            duplicateCandidates: changeSet.duplicateCandidates
          }),
          latestIngestionJobId: latestIngestionJob?.id ?? null,
          reviewers
        }}
      />

      {changeSet.sourceDocument.sourceType === 'gallery' ? (
        <div style={{ marginTop: 16 }}>
          <section className="section-card">
            <header className="section-card-header">
              <div>
                <h2>Promote to venue</h2>
                <p>This change set was extracted in gallery mode — it can be promoted to a canonical Venue record.</p>
              </div>
            </header>
            <div>
              <PromoteVenueAction
                proposedChangeSetId={changeSet.id}
                extractedName={
                  typeof (changeSet.proposedDataJson as Record<string, unknown>)?.venueName === 'string'
                    ? String((changeSet.proposedDataJson as Record<string, unknown>).venueName)
                    : typeof (changeSet.proposedDataJson as Record<string, unknown>)?.name === 'string'
                      ? String((changeSet.proposedDataJson as Record<string, unknown>).name)
                      : undefined
                }
              />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
