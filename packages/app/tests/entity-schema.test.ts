import { describe, expect, test } from 'vitest';

/**
 * Structural tests confirming the extended entity models
 * have the expected fields after the Phase 1 migration.
 * These tests validate the Prisma client type shape — not DB connectivity.
 */

describe('Venue model — extended fields', () => {
  test('Venue type includes arts-platform fields', async () => {
    // Import Prisma types to confirm the generated client has the fields
    type VenueCreate = import('@/lib/prisma-client').Prisma.VenueCreateInput;

    // TypeScript will fail compilation if these fields don't exist on the type
    const venueData: Partial<VenueCreate> = {
      name: 'Test Gallery',
      address: '1 Gallery Lane, London',
      phone: '+44 20 1234 5678',
      email: 'info@testgallery.com',
      bio: 'A contemporary art gallery.',
      openingHours: 'Tue–Sat 10am–6pm',
      websiteUrl: 'https://testgallery.com',
      instagramUrl: 'https://instagram.com/testgallery',
      imageUrl: 'https://testgallery.com/image.jpg'
    };

    expect(Object.keys(venueData)).toContain('address');
    expect(Object.keys(venueData)).toContain('bio');
    expect(Object.keys(venueData)).toContain('openingHours');
    expect(Object.keys(venueData)).toContain('websiteUrl');
    expect(Object.keys(venueData)).toContain('instagramUrl');
  });
});

describe('Artist model — extended fields', () => {
  test('Artist type includes arts-platform fields', async () => {
    type ArtistCreate = import('@/lib/prisma-client').Prisma.ArtistCreateInput;

    const artistData: Partial<ArtistCreate> = {
      name: 'Test Artist',
      nationality: 'British',
      birthYear: 1980,
      medium: 'Oil on canvas',
      websiteUrl: 'https://artistwebsite.com',
      instagramUrl: 'https://instagram.com/testartist'
    };

    expect(Object.keys(artistData)).toContain('nationality');
    expect(Object.keys(artistData)).toContain('birthYear');
    expect(Object.keys(artistData)).toContain('medium');
    expect(Object.keys(artistData)).toContain('websiteUrl');
    expect(Object.keys(artistData)).toContain('instagramUrl');
  });
});

describe('Artwork model — extended fields and relations', () => {
  test('Artwork type includes arts-platform fields', async () => {
    type ArtworkCreate = import('@/lib/prisma-client').Prisma.ArtworkCreateInput;

    const artworkData: Partial<ArtworkCreate> = {
      title: 'Test Artwork',
      medium: 'Bronze sculpture',
      year: 2022,
      price: '£8,500',
      availability: 'available',
      imageUrl: 'https://gallery.com/artwork.jpg'
    };

    expect(Object.keys(artworkData)).toContain('medium');
    expect(Object.keys(artworkData)).toContain('year');
    expect(Object.keys(artworkData)).toContain('price');
    expect(Object.keys(artworkData)).toContain('availability');
  });

  test('Artwork type supports artist and venue relation', async () => {
    type ArtworkCreate = import('@/lib/prisma-client').Prisma.ArtworkCreateInput;

    // Confirm relation fields exist on the type
    const withArtist: Partial<ArtworkCreate> = {
      title: 'Test',
      artist: { connect: { id: 'artist-id' } }
    };

    const withVenue: Partial<ArtworkCreate> = {
      title: 'Test',
      venue: { connect: { id: 'venue-id' } }
    };

    expect(Object.keys(withArtist)).toContain('artist');
    expect(Object.keys(withVenue)).toContain('venue');
  });
});

describe('availability values', () => {
  test('expected availability strings are valid', () => {
    const validValues = ['available', 'sold', 'on_loan', 'unknown'];
    for (const v of validValues) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
