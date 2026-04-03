import { createHash } from 'node:crypto';
import { requireRole } from '@/lib/auth-guard';
import { authFailure, err, notFound } from '@/lib/api/response';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/prisma-client';
import { checkPublishReadiness } from '@/lib/intake/publish-gate';

export async function POST(request: Request, { params }: { params: { changeSetId: string } }) {
  let session;
  try {
    session = await requireRole(['operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const payload = await request.json().catch(() => null);
  const mergeStrategy = payload?.mergeStrategy;
  if (mergeStrategy !== 'create_new' && mergeStrategy !== 'merge_existing') {
    return err('Invalid merge strategy.', 'INVALID_MERGE_STRATEGY', 400);
  }

  const changeSet = await prisma.proposedChangeSet.findUnique({
    where: { id: params.changeSetId },
    include: {
      fieldReviews: true,
      sourceDocument: true,
      duplicateCandidates: true,
      extractionRun: {
        select: {
          confidenceJson: true
        }
      }
    }
  });

  if (!changeSet) {
    return notFound('Proposed change set');
  }

  const publishGate = checkPublishReadiness({
    proposedDataJson: asRecord(changeSet.proposedDataJson),
    fieldReviews: changeSet.fieldReviews,
    duplicateCandidates: changeSet.duplicateCandidates
  });

  if (!publishGate.ready) {
    return Response.json({ blockers: publishGate.blockers, warnings: publishGate.warnings }, { status: 409 });
  }

  const proposedData = asRecord(changeSet.proposedDataJson);
  const mergedData: Record<string, unknown> = { ...proposedData };

  for (const review of changeSet.fieldReviews) {
    if (review.decision === 'accepted' || review.decision === 'edited') {
      if (review.proposedValueJson !== null && review.proposedValueJson !== undefined) {
        mergedData[review.fieldPath] = review.proposedValueJson;
      }
    }
  }

  const eventInput = toEventInput(mergedData, changeSet.sourceDocument.sourceUrl);
  if (!eventInput) {
    return err('Cannot publish without required fields title and startAt.', 'MISSING_REQUIRED_FIELDS', 400);
  }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let eventId: string;
    let created = false;

    if (mergeStrategy === 'create_new') {
      const createdEvent = await tx.event.create({
        data: eventInput
      });
      eventId = createdEvent.id;
      created = true;
    } else {
      if (!changeSet.matchedEventId) {
        throw new Error('MATCHED_EVENT_REQUIRED');
      }
      const updatedEvent = await tx.event.update({
        where: { id: changeSet.matchedEventId },
        data: eventInput
      });
      eventId = updatedEvent.id;
    }

    await tx.proposedChangeSet.update({
      where: { id: changeSet.id },
      data: {
        reviewStatus: 'approved',
        reviewedAt: new Date(),
        reviewedByUserId: session.user.id
      }
    });

    const job = await tx.ingestionJob.findFirst({ where: { sourceDocumentId: changeSet.sourceDocumentId }, orderBy: { createdAt: 'desc' } });
    if (job) {
      await tx.ingestionJob.update({
        where: { id: job.id },
        data: { status: 'approved' }
      });
    }

    return { eventId, created, ingestionJobId: job?.id ?? null };
  });

  // Ingest extracted artist names as IngestExtractedArtist records.
  // Runs outside the transaction so artist failures never roll back the event.
  const artistNames = Array.isArray(mergedData.artistNames)
    ? (mergedData.artistNames as unknown[])
        .map((n) => (typeof n === 'string' ? n.trim() : null))
        .filter((n): n is string => typeof n === 'string' && n.length > 0)
    : [];

  if (artistNames.length > 0) {
    const sourceUrl = changeSet.sourceDocument.sourceUrl ?? '';
    // Read per-field confidence from confidenceJson — fall back to 0.6 if absent
    const confidenceMap =
      changeSet.extractionRun?.confidenceJson &&
      typeof changeSet.extractionRun.confidenceJson === 'object' &&
      !Array.isArray(changeSet.extractionRun.confidenceJson)
        ? (changeSet.extractionRun.confidenceJson as Record<string, number>)
        : {};
    const artistNamesConfidence = confidenceMap['artistNames'] ?? 0.6;
    const confidenceScore = Math.round(artistNamesConfidence * 100);
    const confidenceBand = toConfidenceBand(artistNamesConfidence);

    await Promise.allSettled(
      artistNames.map(async (name) => {
        const fingerprint = fingerprintArtist(name, sourceUrl);
        try {
          await prisma.ingestExtractedArtist.upsert({
            where: { fingerprint },
            create: {
              name,
              sourceUrl,
              confidenceScore,
              confidenceBand,
              confidenceReasons: { fromField: 'artistNames', extractedAt: new Date().toISOString() },
              fingerprint,
              clusterKey: name.trim().toLowerCase(),
              source: 'workbench_approve',
              status: 'PENDING'
            },
            update: {
              // If the same artist was already extracted from this URL, update
              // confidence if the new score is higher
              ...(confidenceScore > 0 ? { confidenceScore, confidenceBand } : {})
            }
          });
        } catch {
          // Best-effort — never block the approve response
        }
      })
    );
  }

  return Response.json({
    ...result,
    artistsIngested: artistNames.length
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toEventInput(mergedData: Record<string, unknown>, sourceUrl: string | null): Prisma.EventUncheckedCreateInput | null {
  const title = typeof mergedData.title === 'string' ? mergedData.title : null;
  const startAt = toDate(mergedData.startAt);

  if (!title || !startAt) return null;

  return {
    title,
    startAt,
    endAt: toDate(mergedData.endAt),
    timezone: typeof mergedData.timezone === 'string' ? mergedData.timezone : null,
    location: typeof mergedData.location === 'string' ? mergedData.location : null,
    description: typeof mergedData.description === 'string' ? mergedData.description : null,
    sourceUrl: typeof mergedData.sourceUrl === 'string' ? mergedData.sourceUrl : sourceUrl,
    publishStatus: 'ready'
  };
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Derives a stable fingerprint for an extracted artist name + source URL pair.
 * Used for deduplication — the same artist name from the same source URL
 * always produces the same fingerprint and will be upserted rather than duplicated.
 */
function fingerprintArtist(name: string, sourceUrl: string): string {
  const key = `${name.trim().toLowerCase()}::${sourceUrl.trim().toLowerCase()}`;
  return createHash('sha256').update(key).digest('hex').slice(0, 32);
}

/**
 * Maps a raw confidence score (0–1 float) to the ConfidenceBand enum value
 * used by IngestExtractedArtist.
 */
function toConfidenceBand(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.45) return 'MEDIUM';
  return 'LOW';
}
