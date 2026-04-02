import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DataTable, EmptyState, PageHeader, SectionCard, StatCard } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import VenueDiscoveryClient from './VenueDiscoveryClient';

export const dynamic = 'force-dynamic';

type VenueRow = {
  id: string;
  name: string;
  slug: string | null;
  domain: string | null;
  region: string | null;
  address: string | null;
  websiteUrl: string | null;
  bio: string | null;
  openingHours: string | null;
  createdAt: Date;
  _count: { events: number; artworks: number };
};

export default async function VenuesPage() {
  if (!isDatabaseRuntimeReady()) {
    return <AdminSetupRequired />;
  }

  try {
    await requireRole(['operator', 'admin']);
  } catch {
    redirect('/login');
  }

  const [venues, totalVenues, venuesByRegion, pendingGalleryJobs] = await Promise.all([
    prisma.venue.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        name: true,
        slug: true,
        domain: true,
        region: true,
        address: true,
        websiteUrl: true,
        bio: true,
        openingHours: true,
        createdAt: true,
        _count: { select: { events: true, artworks: true } }
      }
    }),
    prisma.venue.count(),
    prisma.venue.groupBy({
      by: ['region'],
      _count: { _all: true },
      orderBy: { _count: { region: 'desc' } },
      take: 8
    }),
    prisma.ingestionJob.count({
      where: {
        status: { in: ['queued', 'fetching', 'extracting', 'parsing', 'matching', 'needs_review'] },
        sourceDocument: { sourceType: 'gallery' }
      }
    })
  ]);

  return (
    <div className="stack">
      <PageHeader
        title="Venues"
        description="Discover and import art galleries by region. Approved venues feed the event and artist discovery pipeline."
        actions={
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {totalVenues} venue{totalVenues !== 1 ? 's' : ''} in database
          </span>
        }
      />

      <div className="stats-grid">
        <StatCard label="Total venues" value={totalVenues} detail="In canonical database" />
        <StatCard label="Regions covered" value={venuesByRegion.length} />
        <StatCard
          label="Gallery jobs in progress"
          value={pendingGalleryJobs}
          detail={pendingGalleryJobs > 0 ? 'Check intake queue' : 'None active'}
        />
        <StatCard
          label="Top region"
          value={venuesByRegion[0]?.region ?? '—'}
          detail={venuesByRegion[0] ? `${venuesByRegion[0]._count._all} venues` : 'No venues yet'}
        />
      </div>

      <SectionCard
        title="Discover galleries by region"
        subtitle="Search for contemporary art galleries in a city or region and import them into the venue database."
      >
        <VenueDiscoveryClient />
      </SectionCard>

      <SectionCard
        title="Venue database"
        subtitle="All venues currently in the system. Click a venue to view its detail page."
      >
        <DataTable<VenueRow>
          rows={venues}
          rowKey={(row) => row.id}
          emptyState={
            <EmptyState
              title="No venues yet"
              description="Use the gallery discovery tool above to find and import venues."
            />
          }
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (row) => (
                <Link href={`/venues/${row.id}`} className="inline-link">
                  {row.name}
                </Link>
              )
            },
            { key: 'region', header: 'Region', render: (row) => row.region ?? '—' },
            { key: 'domain', header: 'Domain', render: (row) => row.domain ?? '—' },
            {
              key: 'address',
              header: 'Address',
              render: (row) => row.address ? row.address.slice(0, 50) + (row.address.length > 50 ? '…' : '') : '—'
            },
            {
              key: 'events',
              header: 'Events',
              render: (row) => row._count.events
            },
            {
              key: 'artworks',
              header: 'Artworks',
              render: (row) => row._count.artworks
            },
            {
              key: 'actions',
              header: 'Actions',
              render: (row) => (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link href={`/venues/${row.id}`} className="inline-link">View</Link>
                  {row.websiteUrl ? (
                    <a href={row.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-link">
                      Website ↗
                    </a>
                  ) : null}
                </div>
              )
            }
          ]}
        />
      </SectionCard>

      {venuesByRegion.length > 0 ? (
        <SectionCard title="Coverage by region">
          <div className="stats-grid">
            {venuesByRegion.map((row) => (
              <StatCard
                key={row.region}
                label={row.region ?? 'Unknown'}
                value={row._count._all}
                detail={`venue${row._count._all !== 1 ? 's' : ''}`}
              />
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
