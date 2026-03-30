import { PageHeader } from '@/components/admin';
import { prisma } from '@/lib/db';
import { ConfigClient } from './ConfigClient';

export default async function ConfigPage() {
  const versions = await prisma.pipelineConfigVersion.findMany({ orderBy: { version: 'desc' } });

  return (
    <div className="stack">
      <PageHeader title="Config Versions" description="Review available config snapshots and activate the desired version." />
      <ConfigClient initialVersions={versions} />
    </div>
  );
}
