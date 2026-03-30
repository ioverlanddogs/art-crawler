import { PageHeader } from '@/components/admin';
import { prisma } from '@/lib/db';
import { ModerationClient } from './ModerationClient';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const [items, failures] = await Promise.all([
    prisma.ingestExtractedEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: [{ confidenceScore: 'desc' }, { createdAt: 'desc' }],
      take: 100
    }),
    prisma.pipelineTelemetry.count({ where: { status: 'failure', createdAt: { gte: inLast24Hours() } } })
  ]);

  const initialItems = items.map((item: any) => ({
    id: item.id,
    title: item.title,
    sourceUrl: item.sourceUrl,
    source: item.source,
    confidenceScore: item.confidenceScore,
    confidenceBand: item.confidenceBand,
    status: item.status,
    importBatchId: item.importBatchId,
    createdAt: item.createdAt.toISOString()
  }));

  return (
    <div className="stack">
      <PageHeader
        title="Moderation Queue"
        description="Review imported candidates and decide whether each candidate should advance."
      />
      <ModerationClient initialItems={initialItems} failureCount={failures} />
    </div>
  );
}

function inLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}
