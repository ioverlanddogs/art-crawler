import { authFailure, err, notFound } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import type { DuplicateResolutionStatus, Prisma } from '@/lib/prisma-client';
import { mapResolutionToAuditEvent } from '@/lib/intake/duplicate-resolution';

const ALLOWED: DuplicateResolutionStatus[] = ['unresolved', 'resolved_merge', 'resolved_separate', 'false_positive', 'escalated'];

export async function GET(_request: Request, { params }: { params: { candidateId: string } }) {
  try {
    await requireRole(['moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
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

  if (!candidate) return notFound('Duplicate candidate');
  return Response.json(candidate);
}

export async function PATCH(request: Request, { params }: { params: { candidateId: string } }) {
  let session;
  try {
    session = await requireRole(['moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const payload = await request.json().catch(() => null);
  const resolutionStatus = payload?.resolutionStatus as DuplicateResolutionStatus | undefined;
  const reviewerNote = typeof payload?.reviewerNote === 'string' ? payload.reviewerNote.trim() : undefined;
  const strategy = typeof payload?.strategy === 'string' ? payload.strategy : undefined;

  if (!resolutionStatus || !ALLOWED.includes(resolutionStatus)) {
    return err('Invalid duplicate resolution status.', 'INVALID_DUPLICATE_STATUS', 400);
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const candidate = await tx.duplicateCandidate.update({
      where: { id: params.candidateId },
      data: {
        resolutionStatus,
        reviewerNote: reviewerNote ?? null,
        resolvedAt: resolutionStatus === 'unresolved' ? null : now,
        resolvedByUserId: resolutionStatus === 'unresolved' ? null : session.user.id
      }
    });

    const auditEvent = mapResolutionToAuditEvent(resolutionStatus);

    await tx.pipelineTelemetry.create({
      data: {
        stage: auditEvent,
        status: resolutionStatus === 'escalated' ? 'failure' : 'success',
        entityType: 'DuplicateCandidate',
        entityId: candidate.id,
        detail: `Duplicate candidate ${candidate.id} -> ${resolutionStatus}`,
        metadata: {
          proposedChangeSetId: candidate.proposedChangeSetId,
          canonicalEventId: candidate.canonicalEventId,
          reviewerNote: reviewerNote ?? null,
          strategy: strategy ?? null
        }
      }
    });

    if (resolutionStatus === 'resolved_merge') {
      const changeSet = await tx.proposedChangeSet.findUnique({
        where: { id: candidate.proposedChangeSetId },
        select: { notes: true }
      });
      await tx.proposedChangeSet.update({
        where: { id: candidate.proposedChangeSetId },
        data: {
          notes: `${changeSet?.notes ? `${changeSet.notes}\n` : ''}[duplicate-merge] ${now.toISOString()} · strategy=${strategy ?? 'manual'}${reviewerNote ? ` · note=${reviewerNote}` : ''}`
        }
      });
    }

    return candidate;
  });

  return Response.json({ candidate: result });
}
