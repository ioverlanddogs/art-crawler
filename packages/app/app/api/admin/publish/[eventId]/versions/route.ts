import { authFailure } from '@/lib/api/response';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: { eventId: string } }) {
  try {
    await requireRole(['viewer', 'moderator', 'operator', 'admin']);
  } catch (error) {
    return authFailure(error);
  }

  const versions = await prisma.canonicalRecordVersion.findMany({
    where: { eventId: params.eventId },
    orderBy: { versionNumber: 'desc' },
    take: 10
  });

  return Response.json({
    versions: versions.map((version) => ({
      ...version,
      createdAt: version.createdAt.toISOString()
    }))
  });
}
