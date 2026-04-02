import Link from 'next/link';
import { DataTable, EmptyState, IntakeJobStatusBadge, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';

export const dynamic = 'force-dynamic';

const IN_PROGRESS_STATUSES = ['queued', 'fetching', 'extracting', 'parsing', 'matching'] as const;

export default async function DashboardPage() {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [
    pendingReview,
    failedToday,
    inProgress,
    readyToPublish,
    recentJobs,
    recentLogs,
    topDomains,
    aiProviderSetting,
    aiModelSetting,
    searchProviderSetting
  ] = await Promise.all([
    safeQuery(() => prisma.ingestionJob.count({ where: { status: 'needs_review' } }), 0),
    safeQuery(() => prisma.ingestionJob.count({ where: { status: 'failed', createdAt: { gte: since24h } } }), 0),
    safeQuery(() => prisma.ingestionJob.count({ where: { status: { in: [...IN_PROGRESS_STATUSES] } } }), 0),
    safeQuery(() => prisma.event.count({ where: { publishStatus: 'ready' } }), 0),
    safeQuery(
      () =>
        prisma.ingestionJob.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            sourceDocument: {
              select: {
                sourceUrl: true,
                metadataJson: true
              }
            }
          }
        }),
      []
    ),
    safeQuery(
      () =>
        prisma.ingestionLog.findMany({
          where: { status: 'failure' },
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: { id: true, stage: true, message: true, createdAt: true }
        }),
      []
    ),
    safeQuery(
      () =>
        prisma.urlKnowledge.findMany({
          take: 8,
          orderBy: { successCount: 'desc' },
          select: {
            id: true,
            domain: true,
            platformType: true,
            successCount: true,
            failureCount: true,
            bestExtractionMode: true,
            bestConfidenceScore: true
          }
        }),
      []
    ),
    safeQuery(() => prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_provider' }, select: { value: true } }), null),
    safeQuery(() => prisma.siteSetting.findUnique({ where: { key: 'ai_extraction_model' }, select: { value: true } }), null),
    safeQuery(() => prisma.siteSetting.findUnique({ where: { key: 'search_provider' }, select: { value: true } }), null)
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Dashboard"
        description="What needs attention right now."
        actions={
          <Link href="/intake" className="inline-link">
            + Ingest URL
          </Link>
        }
      />

      <div className="stats-grid">
        <StatCard
          label="Needs review"
          value={
            <span>
              {pendingReview}{' '}
              {pendingReview > 0 ? <StatusBadge tone="warning">degraded</StatusBadge> : null}
            </span>
          }
          detail="/intake?status=needs_review"
        />
        <StatCard label="In progress" value={inProgress} />
        <StatCard
          label="Failed today"
          value={
            <span>
              {failedToday} {failedToday > 0 ? <StatusBadge tone="danger">degraded</StatusBadge> : null}
            </span>
          }
          detail="/intake?status=failed"
        />
        <StatCard label="Ready to publish" value={readyToPublish} detail="/publish" />
      </div>

      <SectionCard title="Recent intake jobs">
        <DataTable
          rows={recentJobs}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No intake jobs yet" description="Submit an intake URL to begin processing." />}
          columns={[
            {
              key: 'url',
              header: 'URL',
              render: (row) => (
                <Link href={`/intake/${row.id}`} className="inline-link" title={row.sourceDocument.sourceUrl}>
                  {truncate(row.sourceDocument.sourceUrl, 60)}
                </Link>
              )
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <IntakeJobStatusBadge status={row.status} />
            },
            {
              key: 'platform',
              header: 'Platform',
              render: (row) => readPlatformType(row.sourceDocument.metadataJson) ?? 'unknown'
            },
            {
              key: 'started',
              header: 'Started',
              render: (row) => (row.startedAt ?? row.createdAt).toLocaleString()
            }
          ]}
        />
      </SectionCard>

      <SectionCard title="Recent pipeline failures">
        <DataTable
          rows={recentLogs}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No recent failures" description="The most recent pipeline runs completed without failures." />}
          columns={[
            { key: 'stage', header: 'Stage', render: (row) => row.stage },
            { key: 'message', header: 'Message', render: (row) => row.message },
            { key: 'time', header: 'Time', render: (row) => row.createdAt.toLocaleString() }
          ]}
        />
      </SectionCard>

      <SectionCard title="Domain knowledge">
        <DataTable
          rows={topDomains}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No URL knowledge yet" description="Knowledge builds automatically after each intake run." />}
          columns={[
            { key: 'domain', header: 'Domain', render: (row) => row.domain },
            { key: 'platform', header: 'Platform type', render: (row) => row.platformType ?? 'unknown' },
            { key: 'success', header: 'Success count', render: (row) => row.successCount },
            { key: 'failure', header: 'Failure count', render: (row) => row.failureCount },
            { key: 'mode', header: 'Best extraction mode', render: (row) => row.bestExtractionMode ?? 'unknown' },
            {
              key: 'confidence',
              header: 'Best confidence',
              render: (row) => (typeof row.bestConfidenceScore === 'number' ? `${Math.round(row.bestConfidenceScore * 100)}%` : '—')
            }
          ]}
        />
      </SectionCard>

      <SectionCard title="Active configuration">
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              <tr>
                <th>AI provider</th>
                <td>{aiProviderSetting?.value ?? 'auto-detect'}</td>
              </tr>
              <tr>
                <th>AI model</th>
                <td>{aiModelSetting?.value ?? 'default'}</td>
              </tr>
              <tr>
                <th>Search provider</th>
                <td>{searchProviderSetting?.value ?? 'not configured'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <Link href="/system" className="inline-link">
            Change settings
          </Link>{' '}
          ·{' '}
          <Link href="/config#model-versions" className="inline-link">
            View model versions
          </Link>
        </p>
      </SectionCard>
    </div>
  );
}

function truncate(value: string, max = 60) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function readPlatformType(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).platformType;
  return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : null;
}

async function safeQuery<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch {
    return fallback;
  }
}
