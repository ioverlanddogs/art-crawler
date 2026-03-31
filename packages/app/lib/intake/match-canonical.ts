import type { PrismaClient } from '@/lib/prisma-client';

export interface MatchResult {
  matchedEventId: string | null;
  matchType: 'exact' | 'fuzzy' | 'none';
  diffJson: Record<string, unknown> | null;
}

function normalizeForComparison(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    parsed.hash = '';
    return parsed.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

export async function matchCanonical(prisma: PrismaClient, fingerprint: string): Promise<MatchResult> {
  const normalizedInput = normalizeForComparison(fingerprint);
  const event = await prisma.event.findFirst({
    where: {
      sourceUrl: {
        equals: normalizedInput,
        mode: 'insensitive'
      }
    },
    select: { id: true }
  });

  if (event) {
    return {
      matchedEventId: event.id,
      matchType: 'exact',
      diffJson: null
    };
  }

  return {
    matchedEventId: null,
    matchType: 'none',
    diffJson: null
  };
}
