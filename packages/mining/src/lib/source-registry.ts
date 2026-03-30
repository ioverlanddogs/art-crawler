export type TrustedSourceStatus = 'ACTIVE' | 'PAUSED' | 'DISABLED';

export interface TrustedSourceRegistryRecord {
  name: string;
  domain: string;
  seedUrl: string;
  sourceType: string;
  region: string;
  trustTier: number;
  status: TrustedSourceStatus;
  allowedPathPatterns: string[];
  blockedPathPatterns: string[];
  extractorType?: string;
  crawlDepth: number;
  maxUrlsPerRun: number;
  notes?: string;
}

export const trustedSourceRegistry: TrustedSourceRegistryRecord[] = [
  {
    name: 'Eventbrite SF Arts',
    domain: 'eventbrite.com',
    seedUrl: 'https://www.eventbrite.com/d/ca--san-francisco/art/',
    sourceType: 'event_platform',
    region: 'us-ca',
    trustTier: 4,
    status: 'ACTIVE',
    allowedPathPatterns: ['/d/', '/e/'],
    blockedPathPatterns: ['/signin', '/help', '/organizer/'],
    extractorType: 'eventbrite',
    crawlDepth: 0,
    maxUrlsPerRun: 1,
    notes: 'Seeded trusted source V1'
  },
  {
    name: 'SFMOMA Calendar',
    domain: 'sfmoma.org',
    seedUrl: 'https://www.sfmoma.org/calendar/',
    sourceType: 'museum',
    region: 'us-ca',
    trustTier: 5,
    status: 'ACTIVE',
    allowedPathPatterns: ['/calendar/', '/event/'],
    blockedPathPatterns: ['/visit/', '/about/'],
    extractorType: 'museum_calendar',
    crawlDepth: 0,
    maxUrlsPerRun: 1,
    notes: 'Seeded trusted source V1'
  },
  {
    name: 'Brooklyn Museum Events',
    domain: 'brooklynmuseum.org',
    seedUrl: 'https://www.brooklynmuseum.org/calendar',
    sourceType: 'museum',
    region: 'us-ny',
    trustTier: 5,
    status: 'ACTIVE',
    allowedPathPatterns: ['/calendar', '/programs/'],
    blockedPathPatterns: ['/about/', '/support/'],
    extractorType: 'museum_calendar',
    crawlDepth: 0,
    maxUrlsPerRun: 1,
    notes: 'Seeded trusted source V1'
  }
];
