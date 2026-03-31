import { PageHeader, SectionCard } from '@/components/admin';
import { prisma } from '@/lib/db';
import { BatchIntakeClient } from './BatchIntakeClient';

export const dynamic = 'force-dynamic';

export default async function BatchIntakePage() {
  const recent = await prisma.sourceDocument.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { sourceUrl: true }
  });

  return (
    <div className="stack">
      <PageHeader title="Batch URL intake" description="Ingest, validate, and forecast yield across grouped URL sessions." />
      <SectionCard title="Batch submission">
        <BatchIntakeClient existingUrls={recent.map((row) => row.sourceUrl)} />
      </SectionCard>
    </div>
  );
}
