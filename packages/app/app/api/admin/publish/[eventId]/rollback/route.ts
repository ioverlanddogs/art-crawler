import { authFailure, err, notFound } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/lib/prisma-client';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { eventId: string } }) {
  let session;
  try {
    session = await requireRole(['admin']);
  } catch (error) {
    return authFailure(error);
  }

  const body = await request.json().catch(() => ({}));
  const versionNumber = Number(body?.versionNumber);
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

  if (!Number.isInteger(versionNumber) || versionNumber < 1 || !reason) {
    return err('versionNumber and reason are required.', 'INVALID_INPUT', 400);
  }

  const event = await prisma.event.findUnique({ where: { id: params.eventId } });
  if (!event) return notFound('Event');

  const targetVersion = await prisma.canonicalRecordVersion.findUnique({
    where: { eventId_versionNumber: { eventId: params.eventId, versionNumber } }
  });
  if (!targetVersion) return notFound('CanonicalRecordVersion');

  const latestVersion = await prisma.canonicalRecordVersion.findFirst({
    where: { eventId: params.eventId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true }
  });

  if (!latestVersion) {
    return err('No versions exist for this event.', 'VERSION_NOT_FOUND', 404);
  }

  if (latestVersion.versionNumber === versionNumber) {
    return err('Cannot rollback to the current version.', 'ROLLBACK_TO_CURRENT', 400);
  }

  const snapshot = asRecord(targetVersion.dataJson);

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const rolledBackEvent = await tx.event.update({
      where: { id: params.eventId },
      data: {
        title: asString(snapshot.title) ?? event.title,
        startAt: asDate(snapshot.startAt) ?? event.startAt,
        endAt: asDate(snapshot.endAt),
        timezone: asNullableString(snapshot.timezone),
        location: asNullableString(snapshot.location),
        description: asNullableString(snapshot.description),
        sourceUrl: asNullableString(snapshot.sourceUrl),
        publishedAt: asDate(snapshot.publishedAt),
        publishStatus: 'rolled_back'
      }
    });

    await tx.canonicalRecordVersion.create({
      data: {
        eventId: params.eventId,
        versionNumber: latestVersion.versionNumber + 1,
        dataJson: {
          title: rolledBackEvent.title,
          startAt: rolledBackEvent.startAt,
          endAt: rolledBackEvent.endAt,
          timezone: rolledBackEvent.timezone,
          location: rolledBackEvent.location,
          description: rolledBackEvent.description,
          sourceUrl: rolledBackEvent.sourceUrl,
          publishStatus: rolledBackEvent.publishStatus,
          publishedAt: rolledBackEvent.publishedAt
        },
        changeSummary: `Rollback to v${versionNumber}: ${reason}`,
        createdByUserId: session.user.id
      }
    });

    await tx.pipelineTelemetry.create({
      data: {
        stage: 'rollback',
        status: 'success',
        entityId: params.eventId,
        entityType: 'Event',
        metadata: {
          rolledBackToVersion: versionNumber,
          reason
        }
      }
    });
  });

  return Response.json({ rolledBack: true, versionNumber });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return null;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}
