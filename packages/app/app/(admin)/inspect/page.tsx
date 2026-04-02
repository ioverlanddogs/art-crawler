import { PageHeader } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import { redirect } from 'next/navigation';
import InspectClient from './InspectClient';

export const dynamic = 'force-dynamic';

export default async function InspectPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  try {
    await requireRole(['operator', 'admin']);
  } catch {
    redirect('/login');
  }

  const [providerSetting, modelSetting] = await Promise.all([
    prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_provider' } }),
    prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_model' } }),
  ]);

  const provider = providerSetting?.value ?? 'anthropic';
  const model = modelSetting?.value ?? null;

  const initialUrl = typeof searchParams?.url === 'string'
    ? decodeURIComponent(searchParams.url)
    : '';

  return (
    <div className="stack">
      <PageHeader
        title="URL inspector"
        description="Fetch a URL, discuss the page with the AI, then push to the intake pipeline with the right extraction mode."
        actions={
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Provider: <strong>{provider}</strong>
            {model ? (
              <>
                {' '}
                · Model: <strong>{model}</strong>
              </>
            ) : null}
          </span>
        }
      />
      <InspectClient initialUrl={initialUrl} />
    </div>
  );
}
