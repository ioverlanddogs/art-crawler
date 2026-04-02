import { DataTable, EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type ArtistRow = {
  id: string;
  name: string;
  slug: string | null;
  nationality: string | null;
  medium: string | null;
  birthYear: number | null;
  websiteUrl: string | null;
  createdAt: Date;
  _count: { artworks: number };
};

type PendingArtistRow = {
  id: string;
  name: string;
  source: string;
  confidenceScore: number;
  confidenceBand: string;
  sourceUrl: string | null;
  createdAt: Date;
};

export default async function ArtistsPage() {
  if (!isDatabaseRuntimeReady()) return <AdminSetupRequired />;

  try {
    await requireRole(['operator', 'admin']);
  } catch {
    redirect('/login');
  }

  const [artists, totalArtists, pendingArtists, totalPending, byMedium, byNationality] = await Promise.all([
    prisma.artist.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        nationality: true,
        medium: true,
        birthYear: true,
        websiteUrl: true,
        createdAt: true,
        _count: { select: { artworks: true } }
      }
    }),
    prisma.artist.count(),
    prisma.ingestExtractedArtist.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        name: true,
        source: true,
        confidenceScore: true,
        confidenceBand: true,
        sourceUrl: true,
        createdAt: true
      }
    }),
    prisma.ingestExtractedArtist.count({ where: { status: 'PENDING' } }),
    prisma.artist.groupBy({
      by: ['medium'],
      _count: { _all: true },
      where: { medium: { not: null } },
      orderBy: { _count: { medium: 'desc' } },
      take: 8
    }),
    prisma.artist.groupBy({
      by: ['nationality'],
      _count: { _all: true },
      where: { nationality: { not: null } },
      orderBy: { _count: { nationality: 'desc' } },
      take: 8
    })
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Artists"
        description="Canonical artist records promoted from extracted data."
        actions={
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {totalArtists} canonical · {totalPending} pending promotion
          </span>
        }
      />

      <div className="stats-grid">
        <StatCard label="Canonical artists" value={totalArtists} detail="Promoted to canonical" />
        <StatCard
          label="Pending promotion"
          value={totalPending}
          detail={totalPending > 0 ? 'Awaiting review' : 'Queue clear'}
        />
        <StatCard label="Nationalities" value={byNationality.length} />
        <StatCard label="Mediums" value={byMedium.length} />
      </div>

      {pendingArtists.length > 0 ? (
        <SectionCard
          title="Pending promotion"
          subtitle="Artists extracted from venue pages awaiting review and promotion to canonical records."
        >
          <DataTable<PendingArtistRow>
            rows={pendingArtists}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No pending artists" description="All extracted artists have been reviewed." />}
            columns={[
              { key: 'name', header: 'Name', render: (row) => row.name },
              { key: 'source', header: 'Source', render: (row) => row.source },
              {
                key: 'confidence',
                header: 'Confidence',
                render: (row) => (
                  <StatusBadge
                    tone={
                      row.confidenceBand === 'HIGH' ? 'success' : row.confidenceBand === 'MEDIUM' ? 'warning' : 'danger'
                    }
                  >
                    {row.confidenceBand} ({row.confidenceScore}%)
                  </StatusBadge>
                )
              },
              {
                key: 'sourceUrl',
                header: 'From',
                render: (row) => {
                  if (!row.sourceUrl) return '—';
                  try {
                    const hostname = new URL(row.sourceUrl).hostname;
                    return (
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-link"
                        title={row.sourceUrl}
                      >
                        {hostname}
                      </a>
                    );
                  } catch {
                    return (
                      <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-link" title={row.sourceUrl}>
                        {row.sourceUrl}
                      </a>
                    );
                  }
                }
              },
              { key: 'date', header: 'Extracted', render: (row) => new Date(row.createdAt).toLocaleDateString() }
            ]}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Canonical artists">
        <DataTable<ArtistRow>
          rows={artists}
          rowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No artists yet"
              description="Promote extracted artists from venue detail pages to build this list."
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (row) =>
                row.websiteUrl ? (
                  <a href={row.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-link">
                    {row.name}
                  </a>
                ) : (
                  row.name
                )
            },
            { key: 'nationality', header: 'Nationality', render: (row) => row.nationality ?? '—' },
            { key: 'medium', header: 'Medium', render: (row) => row.medium ?? '—' },
            { key: 'birthYear', header: 'Born', render: (row) => row.birthYear ?? '—' },
            { key: 'artworks', header: 'Artworks', render: (row) => row._count.artworks },
            { key: 'added', header: 'Added', render: (row) => new Date(row.createdAt).toLocaleDateString() }
          ]}
        />
      </SectionCard>

      {byMedium.length > 0 || byNationality.length > 0 ? (
        <div className="two-col">
          {byMedium.length > 0 ? (
            <SectionCard title="By medium">
              <div className="stats-grid">
                {byMedium.map((row) => (
                  <StatCard key={row.medium} label={row.medium ?? 'Unknown'} value={row._count._all} />
                ))}
              </div>
            </SectionCard>
          ) : null}
          {byNationality.length > 0 ? (
            <SectionCard title="By nationality">
              <div className="stats-grid">
                {byNationality.map((row) => (
                  <StatCard key={row.nationality} label={row.nationality ?? 'Unknown'} value={row._count._all} />
                ))}
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
