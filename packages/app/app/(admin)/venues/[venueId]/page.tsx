import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHeader, SectionCard, StatCard, StatusBadge, DataTable, EmptyState } from '@/components/admin';
import { AdminSetupRequired } from '@/components/admin/AdminSetupRequired';
import { requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { isDatabaseRuntimeReady } from '@/lib/runtime-env';
import VenueEnrichClient from './VenueEnrichClient';

export const dynamic = 'force-dynamic';

export default async function VenueDetailPage({
  params
}: {
  params: { venueId: string }
}) {
  if (!isDatabaseRuntimeReady()) return <AdminSetupRequired />;

  try {
    await requireRole(['operator', 'admin']);
  } catch {
    redirect('/login');
  }

  const venue = await prisma.venue.findUnique({
    where: { id: params.venueId },
    include: {
      events: {
        orderBy: { startAt: 'desc' },
        take: 10,
        select: { id: true, title: true, startAt: true, endAt: true, publishStatus: true }
      },
      artworks: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          medium: true,
          year: true,
          availability: true,
          imageUrl: true,
          artist: { select: { id: true, name: true } }
        }
      }
    }
  });

  if (!venue) notFound();

  const [extractedArtists, enrichmentRuns, intakeJobs] = await Promise.all([
    venue.domain
      ? prisma.ingestExtractedArtist.findMany({
          where: { sourceUrl: { contains: venue.domain }, status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: {
            id: true,
            name: true,
            sourceUrl: true,
            confidenceScore: true,
            confidenceBand: true,
            createdAt: true
          }
        })
      : Promise.resolve([]),
    prisma.enrichmentRun.findMany({
      where: { entityType: 'Venue', entityId: params.venueId },
      orderBy: { createdAt: 'desc' },
      take: 10
    }),
    prisma.ingestionJob.findMany({
      where: {
        sourceDocument: {
          sourceUrl: venue.domain ? { contains: venue.domain } : undefined
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, status: true, createdAt: true, sourceDocument: { select: { sourceUrl: true, sourceType: true } } }
    })
  ]);

  type ArtworkRow = typeof venue.artworks[number];
  type EventRow = typeof venue.events[number];
  type ArtistRow = typeof extractedArtists[number];

  return (
    <div className="stack">
      <PageHeader
        title={venue.name}
        description={[venue.region, venue.address].filter(Boolean).join(' · ')}
        actions={
          <Link href="/venues" className="action-button variant-secondary">
            ← All venues
          </Link>
        }
      />

      <div className="stats-grid">
        <StatCard label="Events" value={venue.events.length} detail="Most recent 10 shown" />
        <StatCard label="Artworks" value={venue.artworks.length} detail="Most recent 20 shown" />
        <StatCard label="Extracted artists" value={extractedArtists.length} detail="Pending promotion" />
        <StatCard label="Enrichment runs" value={enrichmentRuns.length} />
      </div>

      <SectionCard title="Venue details">
        <table className="data-table">
          <tbody>
            {venue.bio ? <tr><th>Bio</th><td style={{ lineHeight: 1.6 }}>{venue.bio}</td></tr> : null}
            {venue.address ? <tr><th>Address</th><td>{venue.address}</td></tr> : null}
            {venue.phone ? <tr><th>Phone</th><td>{venue.phone}</td></tr> : null}
            {venue.email ? <tr><th>Email</th><td><a href={`mailto:${venue.email}`} className="inline-link">{venue.email}</a></td></tr> : null}
            {venue.openingHours ? <tr><th>Opening hours</th><td>{venue.openingHours}</td></tr> : null}
            {venue.domain ? <tr><th>Domain</th><td>{venue.domain}</td></tr> : null}
            {venue.websiteUrl ? <tr><th>Website</th><td><a href={venue.websiteUrl} target="_blank" rel="noopener noreferrer" className="inline-link">{venue.websiteUrl}</a></td></tr> : null}
            {venue.instagramUrl ? <tr><th>Instagram</th><td><a href={venue.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-link">{venue.instagramUrl}</a></td></tr> : null}
            {venue.region ? <tr><th>Region</th><td>{venue.region}</td></tr> : null}
          </tbody>
        </table>
      </SectionCard>

      <SectionCard
        title="Enrichment"
        subtitle="Run the inspector against sub-pages of this venue to collect artists, artworks, and events."
      >
        <VenueEnrichClient
          venueId={params.venueId}
          venueName={venue.name}
          venueDomain={venue.domain}
          venueWebsiteUrl={venue.websiteUrl}
        />
      </SectionCard>

      {extractedArtists.length > 0 ? (
        <SectionCard
          title="Extracted artists — pending promotion"
          subtitle={`${extractedArtists.length} artist${extractedArtists.length !== 1 ? 's' : ''} extracted from this venue's pages and awaiting review.`}
        >
          <DataTable<ArtistRow>
            rows={extractedArtists}
            rowKey={(row) => row.id}
            emptyState={<EmptyState title="No pending artists" description="Run artist enrichment to extract artists from this venue." />}
            columns={[
              { key: 'name', header: 'Name', render: (row) => row.name },
              {
                key: 'confidence',
                header: 'Confidence',
                render: (row) => (
                  <StatusBadge
                    tone={row.confidenceBand === 'HIGH' ? 'success' : row.confidenceBand === 'MEDIUM' ? 'warning' : 'danger'}
                  >
                    {row.confidenceBand} ({row.confidenceScore}%)
                  </StatusBadge>
                )
              },
              {
                key: 'source',
                header: 'Source URL',
                render: (row) => row.sourceUrl
                  ? <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-link">{new URL(row.sourceUrl).pathname.slice(0, 40)}</a>
                  : '—'
              },
              { key: 'date', header: 'Extracted', render: (row) => new Date(row.createdAt).toLocaleDateString() }
            ]}
          />
        </SectionCard>
      ) : null}

      <SectionCard title="Artworks">
        <DataTable<ArtworkRow>
          rows={venue.artworks}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No artworks" description="Run artwork enrichment to extract artworks from this venue." />}
          columns={[
            { key: 'title', header: 'Title', render: (row) => row.title },
            { key: 'artist', header: 'Artist', render: (row) => row.artist?.name ?? '—' },
            { key: 'medium', header: 'Medium', render: (row) => row.medium ?? '—' },
            { key: 'year', header: 'Year', render: (row) => row.year ?? '—' },
            {
              key: 'availability',
              header: 'Availability',
              render: (row) => row.availability ? (
                <StatusBadge tone={row.availability === 'available' ? 'success' : row.availability === 'sold' ? 'neutral' : 'warning'}>
                  {row.availability}
                </StatusBadge>
              ) : '—'
            }
          ]}
        />
      </SectionCard>

      <SectionCard title="Events">
        <DataTable<EventRow>
          rows={venue.events}
          rowKey={(row) => row.id}
          emptyState={<EmptyState title="No events" description="Run events enrichment to extract events from this venue." />}
          columns={[
            { key: 'title', header: 'Title', render: (row) => row.title },
            { key: 'startAt', header: 'Start', render: (row) => new Date(row.startAt).toLocaleDateString() },
            { key: 'endAt', header: 'End', render: (row) => row.endAt ? new Date(row.endAt).toLocaleDateString() : '—' },
            {
              key: 'status',
              header: 'Status',
              render: (row) => (
                <StatusBadge tone={row.publishStatus === 'published' ? 'success' : row.publishStatus === 'ready' ? 'info' : 'neutral'}>
                  {row.publishStatus}
                </StatusBadge>
              )
            }
          ]}
        />
      </SectionCard>

      {enrichmentRuns.length > 0 ? (
        <SectionCard title="Enrichment history">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mode</th>
                <th>Status</th>
                <th>Source URL</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {enrichmentRuns.map((run) => (
                <tr key={run.id}>
                  <td><code>{run.template}</code></td>
                  <td>
                    <StatusBadge tone={run.status === 'SUCCESS' ? 'success' : run.status === 'FAILED' ? 'danger' : 'neutral'}>
                      {run.status}
                    </StatusBadge>
                  </td>
                  <td>{run.sourceUrl ? <a href={run.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-link">{run.sourceUrl.slice(0, 50)}</a> : '—'}</td>
                  <td>{new Date(run.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      ) : null}

      {intakeJobs.length > 0 ? (
        <SectionCard title="Recent intake jobs from this domain">
          <ul className="timeline">
            {intakeJobs.map((job) => (
              <li key={job.id}>
                <Link href={`/intake/${job.id}`} className="inline-link">
                  {job.sourceDocument.sourceUrl.slice(0, 70)}
                </Link>
                <p className="muted" style={{ fontSize: 12 }}>
                  {job.sourceDocument.sourceType ?? 'unknown'} · {job.status} · {new Date(job.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </div>
  );
}
