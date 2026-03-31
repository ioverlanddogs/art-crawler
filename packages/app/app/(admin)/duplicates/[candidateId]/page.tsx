import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, SectionCard } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import { recommendDuplicateOutcome } from '@/lib/admin/triage-recommendations';
import { DuplicateDecisionPanel } from './DuplicateDecisionPanel';

export const dynamic = 'force-dynamic';

export default async function DuplicateComparePage({ params }: { params: { candidateId: string } }) {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  const candidate = await prisma.duplicateCandidate.findUnique({
    where: { id: params.candidateId },
    include: {
      proposedChangeSet: {
        include: {
          extractionRun: true,
          sourceDocument: true
        }
      },
      canonicalEvent: true
    }
  });
  if (!candidate) notFound();

  const proposal = asRecord(candidate.proposedChangeSet.proposedDataJson);
  const canonical: Record<string, unknown> = candidate.canonicalEvent
    ? {
        title: candidate.canonicalEvent.title,
        startAt: candidate.canonicalEvent.startAt,
        endAt: candidate.canonicalEvent.endAt,
        timezone: candidate.canonicalEvent.timezone,
        location: candidate.canonicalEvent.location,
        description: candidate.canonicalEvent.description,
        sourceUrl: candidate.canonicalEvent.sourceUrl
      }
    : {};
  const allFields = [...new Set([...Object.keys(proposal), ...Object.keys(canonical)])];
  const corroborationByField = asRecord(candidate.fieldCorroborationJson);
  const duplicateRecommendation = recommendDuplicateOutcome({
    matchConfidence: candidate.matchConfidence,
    corroborationSourceCount: candidate.corroborationSourceCount,
    corroborationConfidence: candidate.corroborationConfidence,
    conflictingSourceCount: candidate.conflictingSourceCount,
    unresolvedBlockerCount: candidate.unresolvedBlockerCount,
    hasCanonicalTarget: Boolean(candidate.canonicalEventId)
  });

  return (
    <div className="stack">
      <PageHeader
        title="Duplicate compare + merge"
        description="Side-by-side corroboration workflow for safe duplicate resolution."
        actions={<Link href="/duplicates" className="action-button variant-secondary">Back to duplicate queue</Link>}
      />

      <div className="three-col">
        <SectionCard title="Source evidence / extracted proposal" subtitle={candidate.proposedChangeSet.sourceDocument.sourceUrl}>
          <p className="muted">Confidence: <strong>{Math.round(candidate.matchConfidence * 100)}%</strong> · Corroborating sources: <strong>{candidate.corroborationSourceCount}</strong></p>
          <p className="muted">Confidence explanation: {candidate.confidenceExplanation ?? 'No explanation recorded.'}</p>
          <pre>{JSON.stringify(candidate.proposedChangeSet.extractionRun?.evidenceJson ?? {}, null, 2)}</pre>
        </SectionCard>

        <SectionCard title="Canonical target" subtitle={candidate.canonicalEvent ? candidate.canonicalEvent.title : 'No canonical target'}>
          <p className="muted">Duplicate risk explanation: {candidate.duplicateRiskExplanation ?? 'No explanation recorded.'}</p>
          {candidate.canonicalEvent ? (
            <p className="muted">Canonical event ID: <code>{candidate.canonicalEvent.id}</code></p>
          ) : (
            <p className="muted">No suggested canonical record exists.</p>
          )}
        </SectionCard>

        <SectionCard title="Merge decision panel" subtitle={`Current status: ${candidate.resolutionStatus}`}>
          <p className="muted">{duplicateRecommendation.recommendation.summary}</p>
          <p className="kpi-note">{duplicateRecommendation.confidenceExplanation}</p>
          <p className="kpi-note">{duplicateRecommendation.corroborationExplanation}</p>
          <DuplicateDecisionPanel candidateId={candidate.id} recommendedAction={duplicateRecommendation.recommendation.action} />
        </SectionCard>
      </div>

      <SectionCard title="Field-by-field diff + corroboration">
        <table className="data-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Proposed value</th>
              <th>Canonical value</th>
              <th>Corroboration</th>
              <th>Conflict</th>
            </tr>
          </thead>
          <tbody>
            {allFields.map((fieldPath) => {
              const corroboration = asRecord(corroborationByField[fieldPath]);
              const isConflict = proposal[fieldPath] !== canonical[fieldPath];
              return (
                <tr key={fieldPath}>
                  <td><code>{fieldPath}</code></td>
                  <td>{toCell(proposal[fieldPath])}</td>
                  <td>{toCell(canonical[fieldPath])}</td>
                  <td>{String(corroboration.count ?? 0)} source(s) · {Math.round(Number(corroboration.confidence ?? 0) * 100)}%</td>
                  <td>{isConflict ? <span className="tone-danger">conflict</span> : <span className="tone-success">aligned</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toCell(value: unknown) {
  if (value == null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}
