import { PageHeader } from '@/components/admin';
import { prisma } from '@/lib/db';
import { listModerationCandidates } from '@/lib/pipeline/import-service';
import { ModerationClient } from './ModerationClient';

export default async function ModerationPage() {
  const items = await listModerationCandidates(prisma);

  return (
    <div className="stack">
      <PageHeader
        title="Moderation Queue"
        description="Review imported candidates and decide whether each candidate should advance."
      />
      <ModerationClient initialItems={items} />
    </div>
  );
}
