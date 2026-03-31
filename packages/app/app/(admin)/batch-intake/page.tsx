import { PageHeader, SectionCard } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import { BatchIntakeClient } from './BatchIntakeClient';

export const dynamic = 'force-dynamic';

export default async function BatchIntakePage() {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

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
