import { prisma } from './db.js';

export interface RegisterTrustedSourceInput {
  name: string;
  domain: string;
  seedUrl: string;
  sourceType: string;
  region: string;
  trustTier?: number;
  platformType?: string | null;
  notes?: string;
}

export async function registerTrustedSource(
  input: RegisterTrustedSourceInput
): Promise<{ registered: boolean; id?: string; reason?: string }> {
  try {
    const existing = await prisma.trustedSource.findUnique({
      where: { seedUrl: input.seedUrl },
      select: { id: true }
    });

    if (existing) {
      return { registered: false, reason: 'seedUrl already registered', id: existing.id };
    }

    const source = await prisma.trustedSource.create({
      data: {
        name: input.name,
        domain: input.domain,
        seedUrl: input.seedUrl,
        sourceType: input.sourceType,
        region: input.region,
        trustTier: input.trustTier ?? 3,
        status: 'ACTIVE',
        allowedPathPatterns: [],
        blockedPathPatterns: ['/cart', '/checkout', '/account', '/signin', '/login'],
        crawlDepth: 1,
        maxUrlsPerRun: 5,
        notes: input.notes ?? `Registered via admin API. Platform: ${input.platformType ?? 'unknown'}`
      },
      select: { id: true }
    });

    return { registered: true, id: source.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.error('[trusted-source-admin] registerTrustedSource failed:', message);
    return { registered: false, reason: message };
  }
}

export async function listTrustedSources(): Promise<Array<{
  id: string;
  name: string;
  domain: string;
  seedUrl: string;
  sourceType: string;
  region: string;
  trustTier: number;
  status: string;
  lastDiscoveredAt: Date | null;
  createdAt: Date;
}>> {
  return prisma.trustedSource.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      domain: true,
      seedUrl: true,
      sourceType: true,
      region: true,
      trustTier: true,
      status: true,
      lastDiscoveredAt: true,
      createdAt: true
    }
  });
}
