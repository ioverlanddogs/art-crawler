import { DataTable, EmptyState, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

type ArtworkRow = {
  id: string;
  title: string;
  medium: string | null;
  year: number | null;
  price: string | null;
  availability: string | null;
  imageUrl: string | null;
  createdAt: Date;
  artist: { id: string; name: string } | null;
  venue: { id: string; name: string } | null;
};

type PendingArtworkRow = {
  id: string;
  title: string;
  artistName: string | null;
  source: string;
  confidenceScore: number;
  confidenceBand: string;
  sourceUrl: string | null;
  createdAt: Date;
};

export default async function ArtworksPage() {
  if (!isDatabaseRuntimeReady()) return <AdminSetupRequired />;

  try {
    await requireRole(['operator', 'admin']);
  } catch {
    redirect('/login');
  }

  const [artworks, totalArtworks, pendingArtworks, totalPending, byAvailability, byMedium] = await Promise.all([
    prisma.artwork.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        medium: true,
        year: true,
        price: true,
        availability: true,
        imageUrl: true,
        createdAt: true,
        artist: { select: { id: true, name: true } },
        venue: { select: { id: true, name: true } }
      }
    }),
    prisma.artwork.count(),
    prisma.ingestExtractedArtwork.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        artistName: true,
        source: true,
        confidenceScore: true,
        confidenceBand: true,
        sourceUrl: true,
        createdAt: true
      }
    }),
    prisma.ingestExtractedArtwork.count({ where: { status: 'PENDING' } }),
    prisma.artwork.groupBy({
      by: ['availability'],
      _count: { _all: true },
      where: { availability: { not: null } },
      orderBy: { _count: { availability: 'desc' } }
    }),
    prisma.artwork.groupBy({
      by: ['medium'],
      _count: { _all: true },
      where: { medium: { not: null } },
      orderBy: { _count: { medium: 'desc' } },
      take: 8
    })
  ]);

  function availabilityTone(a: string | null) {
    if (a === 'available') return 'success' as const;
    if (a === 'sold') return 'neutral' as const;
    if (a === 'on_loan') return 'info' as const;
    return 'warning' as const;
  }

  return (
    <div className="stack">
      <PageHeader
        title="Artworks"
        description="Canonical artwork records linked to artists and venues."
        actions={
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {totalArtworks} canonical · {totalPending} pending
          </span>
        }
      />

      <div className="stats-grid">
        <StatCard label="Total artworks" value={totalArtworks} />
        <StatCard label="Pending promotion" value={totalPending} />
        <StatCard
          label="Available"
          value={byAvailability.find((r) => r.availability === 'available')?._count._all ?? 0}
        />
        <StatCard label="Sold" value={byAvailability.find((r) => r.availability === 'sold')?._count._all ?? 0} />
      </div>

      {pendingArtworks.length > 0 ? (
        <SectionCard title="Pending promotion" subtitle="Artworks extracted from venue pages awaiting review.">
          <DataTable<PendingArtworkRow>
            rows={pendingArtworks}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No pending artworks" description="All extracted artworks have been reviewed." />}
            columns={[
              { key: 'title', header: 'Title', render: (row) => row.title },
              { key: 'artist', header: 'Artist', render: (row) => row.artistName ?? '—' },
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
              { key: 'date', header: 'Extracted', render: (row) => new Date(row.createdAt).toLocaleDateString() }
            ]}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Canonical artworks">
        <DataTable<ArtworkRow>
          rows={artworks}
          rowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No artworks yet"
              description="Run artwork enrichment from venue detail pages to populate this list."
            />
          }
          columns={[
            { key: 'title', header: 'Title', render: (row) => row.title },
            {
              key: 'artist',
              header: 'Artist',
              render: (row) =>
                row.artist ? (
                  <a href={`#artist-${row.artist.id}`} className="inline-link">
                    {row.artist.name}
                  </a>
                ) : (
                  '—'
                )
            },
            {
              key: 'venue',
              header: 'Venue',
              render: (row) =>
                row.venue ? (
                  <a href={`/venues/${row.venue.id}`} className="inline-link">
                    {row.venue.name}
                  </a>
                ) : (
                  '—'
                )
            },
            { key: 'medium', header: 'Medium', render: (row) => row.medium ?? '—' },
            { key: 'year', header: 'Year', render: (row) => row.year ?? '—' },
            { key: 'price', header: 'Price', render: (row) => row.price ?? '—' },
            {
              key: 'availability',
              header: 'Availability',
              render: (row) =>
                row.availability ? <StatusBadge tone={availabilityTone(row.availability)}>{row.availability}</StatusBadge> : '—'
            }
          ]}
        />
      </SectionCard>

      {byMedium.length > 0 ? (
        <SectionCard title="By medium">
          <div className="stats-grid">
            {byMedium.map((row) => (
              <StatCard key={row.medium} label={row.medium ?? 'Unknown'} value={row._count._all} />
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
