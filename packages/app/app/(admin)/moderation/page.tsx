import { PageHeader } from '@/components/admin';
import { prisma } from '@/lib/db';
import { listModerationCandidates } from '@/lib/pipeline/import-service';
import { ModerationClient } from './ModerationClient';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const [items, failures] = await Promise.all([
    listModerationCandidates(prisma),
    prisma.pipelineTelemetry.count({ where: { status: 'failure', createdAt: { gte: inLast24Hours() } } })
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Moderation Queue"
        description="Review imported candidates and decide whether each candidate should advance."
      />
      <ModerationClient initialItems={items} failureCount={failures} />
    </div>
  );
}

function inLast24Hours() {
  return new Date(Date.now() - 24 * 60 * 60 * 1000);
}
