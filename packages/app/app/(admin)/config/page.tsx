import { AlertBanner, PageHeader } from '@/components/admin';
import { prisma } from '@/lib/db';
import { ConfigClient } from './ConfigClient';

export const dynamic = 'force-dynamic';

const AUDIT_STAGES = [
  'config_activate',
  'config_rollback',
  'model_promote',
  'model_rollback',
  'moderation_approve',
  'moderation_reject',
  'moderation_bulk_approve',
  'moderation_bulk_reject',
  'user_invite',
  'role_change',
  'maintenance_flag_change'
];

export default async function ConfigPage() {
  const [versionsResult, modelsResult, auditResult, automationResult] = await Promise.allSettled([
    prisma.pipelineConfigVersion.findMany({ orderBy: { version: 'desc' }, take: 30 }),
    prisma.modelVersion.findMany({ orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.pipelineTelemetry.findMany({
      where: { stage: { in: AUDIT_STAGES } },
      orderBy: { createdAt: 'desc' },
      take: 150
    }),
    prisma.pipelineTelemetry.findMany({
      where: {
        OR: [
          { stage: { contains: 'auto' } },
          { stage: { contains: 'rule' } },
          { stage: { contains: 'policy' } },
          { stage: { contains: 'bulk' } },
          { stage: { contains: 'escalat' } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 120
    })
  ]);

  const versions = versionsResult.status === 'fulfilled' ? versionsResult.value : [];
  const models = modelsResult.status === 'fulfilled' ? modelsResult.value : [];
  const auditEvents = auditResult.status === 'fulfilled' ? auditResult.value : [];
  const automationEvents = automationResult.status === 'fulfilled' ? automationResult.value : [];

  const hasPartialData = [versionsResult, modelsResult, auditResult, automationResult].some((result) => result.status === 'rejected');

  return (
    <div className="stack">
      <PageHeader
        title="Governance & Model Operations"
        description="Deliberate control surface for global config and model actions with change history and safety guardrails."
      />
      {hasPartialData ? (
        <AlertBanner tone="warning" title="Some governance data is unavailable">
          This page is still usable, but one or more data sources did not load. Missing sections are labeled with incomplete context.
        </AlertBanner>
      ) : null}
      <ConfigClient
        initialVersions={versions}
        initialModels={models}
        auditEvents={auditEvents}
        automationEvents={automationEvents}
        hasPartialData={hasPartialData}
      />
    </div>
  );
}
