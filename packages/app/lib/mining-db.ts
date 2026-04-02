/**
 * Optional connection to the mining service database.
 * Only available when MINING_DATABASE_URL is set in the app environment.
 * Used to register approved venues as TrustedSource records for automated crawling.
 *
 * If MINING_DATABASE_URL is not set, all functions in this module are no-ops.
 */
import { PrismaClient } from './prisma-client';

let _miningPrisma: PrismaClient | null = null;

function getMiningPrisma(): PrismaClient | null {
  const url = process.env.MINING_DATABASE_URL;
  if (!url?.trim()) return null;

  if (!_miningPrisma) {
    _miningPrisma = new PrismaClient({
      datasources: { db: { url } }
    });
  }
  return _miningPrisma;
}

export interface TrustedSourceRegistration {
  name: string;
  domain: string;
  seedUrl: string;
  region: string;
  platformType?: string | null;
  notes?: string;
}

/**
 * Registers a venue as a TrustedSource in the mining database.
 * Safe to call even when MINING_DATABASE_URL is not configured — silently no-ops.
 * Never throws — failures are logged but do not block venue creation.
 */
export async function registerVenueAsTrustedSource(
  registration: TrustedSourceRegistration
): Promise<{ registered: boolean; reason?: string }> {
  const miningPrisma = getMiningPrisma();

  if (!miningPrisma) {
    return { registered: false, reason: 'MINING_DATABASE_URL not configured' };
  }

  try {
    const existing = await (miningPrisma as unknown as {
      trustedSource: {
        findUnique: (args: unknown) => Promise<unknown>;
        create: (args: unknown) => Promise<unknown>;
      };
    }).trustedSource.findUnique({
      where: { seedUrl: registration.seedUrl }
    });

    if (existing) {
      return { registered: false, reason: 'Already registered as TrustedSource' };
    }

    await (miningPrisma as unknown as {
      trustedSource: {
        create: (args: unknown) => Promise<unknown>;
      };
    }).trustedSource.create({
      data: {
        name: registration.name,
        domain: registration.domain,
        seedUrl: registration.seedUrl,
        sourceType: 'gallery',
        region: registration.region || 'global',
        trustTier: 3,
        status: 'ACTIVE',
        allowedPathPatterns: [],
        blockedPathPatterns: ['/cart', '/checkout', '/account', '/signin', '/login'],
        crawlDepth: 1,
        maxUrlsPerRun: 5,
        notes: registration.notes ?? `Auto-registered from venue promotion. Platform: ${registration.platformType ?? 'unknown'}`
      }
    });

    return { registered: true };
  } catch (error: unknown) {
    console.error('[mining-db] registerVenueAsTrustedSource failed:', error instanceof Error ? error.message : error);
    return { registered: false, reason: error instanceof Error ? error.message : 'Unknown error' };
  }
}
