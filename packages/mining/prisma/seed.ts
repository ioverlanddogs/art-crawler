import { PrismaClient } from '../generated/prisma';
import { trustedSourceRegistry } from '../src/lib/source-registry.js';

const prisma = new PrismaClient();

async function main() {
  for (const source of trustedSourceRegistry) {
    await prisma.trustedSource.upsert({
      where: { seedUrl: source.seedUrl },
      create: source,
      update: {
        name: source.name,
        domain: source.domain,
        sourceType: source.sourceType,
        region: source.region,
        trustTier: source.trustTier,
        status: source.status,
        allowedPathPatterns: source.allowedPathPatterns,
        blockedPathPatterns: source.blockedPathPatterns,
        extractorType: source.extractorType,
        crawlDepth: source.crawlDepth,
        maxUrlsPerRun: source.maxUrlsPerRun,
        notes: source.notes
      }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
