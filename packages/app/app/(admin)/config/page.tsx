import { PageHeader } from '@/components/admin';
import { prisma } from '@/lib/db';
import { ConfigClient } from './ConfigClient';

export const dynamic = 'force-dynamic';

export default async function ConfigPage() {
  const [versions, models, auditEvents] = await Promise.all([
    prisma.pipelineConfigVersion.findMany({ orderBy: { version: 'desc' } }),
    prisma.modelVersion.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.pipelineTelemetry.findMany({
      where: { stage: { in: ['config_activate', 'model_promote'] } },
      orderBy: { createdAt: 'desc' },
      take: 20
    })
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Config & Model Control"
        description="Safely activate pipeline config versions and manually promote model versions with audit visibility."
      />
      <ConfigClient initialVersions={versions} initialModels={models} auditEvents={auditEvents} />
    </div>
  );
}
