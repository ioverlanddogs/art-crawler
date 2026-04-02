/**
 * Detects the CMS, hosted platform, or JS framework running at a URL
 * from HTML content, response headers, and domain patterns.
 *
 * Used to populate VenueProfile.platformType and requiresJs after fetch.
 */

export type PlatformType =
  // Hosted event platforms
  | 'eventbrite'
  | 'dice'
  | 'resident_advisor'
  | 'eventim'
  | 'ticketmaster'
  | 'bandsintown'
  // Gallery / museum platforms
  | 'artsy'
  | 'artnet'
  | 'axiell'
  | 'gallery_systems'
  // Generic CMSs
  | 'wordpress'
  | 'squarespace'
  | 'wix'
  | 'webflow'
  | 'shopify'
  | 'drupal'
  // JS-heavy SPAs
  | 'nextjs'
  | 'react'
  | 'vue'
  | 'angular'
  // Fallback
  | 'unknown';

export interface PlatformDetectionResult {
  platformType: PlatformType;
  requiresJs: boolean;
  confidence: 'high' | 'medium' | 'low';
  signals: string[];
}

function checkDomain(hostname: string): { platformType: PlatformType; signals: string[] } | null {
  const h = hostname.toLowerCase();
  if (h.includes('eventbrite.')) return { platformType: 'eventbrite', signals: ['domain:eventbrite'] };
  if (h.includes('dice.fm') || h.includes('dice.')) return { platformType: 'dice', signals: ['domain:dice'] };
  if (h.includes('ra.co') || h.includes('residentadvisor.')) return { platformType: 'resident_advisor', signals: ['domain:ra'] };
  if (h.includes('eventim.')) return { platformType: 'eventim', signals: ['domain:eventim'] };
  if (h.includes('ticketmaster.')) return { platformType: 'ticketmaster', signals: ['domain:ticketmaster'] };
  if (h.includes('bandsintown.')) return { platformType: 'bandsintown', signals: ['domain:bandsintown'] };
  if (h.includes('artsy.net')) return { platformType: 'artsy', signals: ['domain:artsy'] };
  if (h.includes('artnet.')) return { platformType: 'artnet', signals: ['domain:artnet'] };
  return null;
}

function checkHtmlSignals(html: string): { platformType: PlatformType; requiresJs: boolean; signals: string[] }[] {
  const results: { platformType: PlatformType; requiresJs: boolean; signals: string[] }[] = [];
  const lower = html.toLowerCase();

  // WordPress
  if (lower.includes('/wp-content/') || lower.includes('/wp-includes/') || lower.includes('wp-json')) {
    results.push({ platformType: 'wordpress', requiresJs: false, signals: ['html:wp-content'] });
  }

  // Squarespace
  if (lower.includes('squarespace') || lower.includes('static1.squarespace.com')) {
    results.push({ platformType: 'squarespace', requiresJs: true, signals: ['html:squarespace'] });
  }

  // Wix
  if (lower.includes('wix.com') || lower.includes('wixstatic.com') || lower.includes('wix-bolt')) {
    results.push({ platformType: 'wix', requiresJs: true, signals: ['html:wix'] });
  }

  // Webflow
  if (lower.includes('webflow') || lower.includes('uploads-ssl.webflow.com')) {
    results.push({ platformType: 'webflow', requiresJs: true, signals: ['html:webflow'] });
  }

  // Shopify
  if (lower.includes('cdn.shopify.com') || lower.includes('shopify.com/s/')) {
    results.push({ platformType: 'shopify', requiresJs: true, signals: ['html:shopify'] });
  }

  // Drupal
  if (lower.includes('drupal') || lower.includes('/sites/default/files/')) {
    results.push({ platformType: 'drupal', requiresJs: false, signals: ['html:drupal'] });
  }

  // Artsy
  if (lower.includes('artsy.net') || lower.includes('"artsy"')) {
    results.push({ platformType: 'artsy', requiresJs: true, signals: ['html:artsy'] });
  }

  // Axiell
  if (lower.includes('axiell') || lower.includes('axiellmedia')) {
    results.push({ platformType: 'axiell', requiresJs: false, signals: ['html:axiell'] });
  }

  // Gallery Systems / TMS
  if (lower.includes('gallery systems') || lower.includes('gallerysystems') || lower.includes('tms-emuseum')) {
    results.push({ platformType: 'gallery_systems', requiresJs: false, signals: ['html:gallery_systems'] });
  }

  // Next.js
  if (lower.includes('__next') || lower.includes('/_next/static') || lower.includes('next.js')) {
    results.push({ platformType: 'nextjs', requiresJs: true, signals: ['html:nextjs'] });
  }

  // React (generic, lower confidence)
  if (
    lower.includes('react-root') ||
    lower.includes('data-reactroot') ||
    lower.includes('react.development') ||
    lower.includes('react.production')
  ) {
    results.push({ platformType: 'react', requiresJs: true, signals: ['html:react'] });
  }

  // Vue
  if (lower.includes('vue.js') || lower.includes('__vue__') || lower.includes('data-v-app')) {
    results.push({ platformType: 'vue', requiresJs: true, signals: ['html:vue'] });
  }

  // Angular
  if (lower.includes('ng-version') || (lower.includes('angular') && lower.includes('zone.js'))) {
    results.push({ platformType: 'angular', requiresJs: true, signals: ['html:angular'] });
  }

  return results;
}

function checkMetaTags(html: string): { platformType: PlatformType; signals: string[] } | null {
  const generatorMatch = html.match(/<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)["']/i);
  if (!generatorMatch) return null;

  const generator = generatorMatch[1].toLowerCase();
  if (generator.includes('wordpress')) return { platformType: 'wordpress', signals: ['meta:generator:wordpress'] };
  if (generator.includes('drupal')) return { platformType: 'drupal', signals: ['meta:generator:drupal'] };
  if (generator.includes('squarespace')) return { platformType: 'squarespace', signals: ['meta:generator:squarespace'] };
  if (generator.includes('wix')) return { platformType: 'wix', signals: ['meta:generator:wix'] };
  if (generator.includes('webflow')) return { platformType: 'webflow', signals: ['meta:generator:webflow'] };
  return null;
}

function checkResponseHeaders(headers: Record<string, string>): { platformType: PlatformType; signals: string[] } | null {
  const powered = (headers['x-powered-by'] ?? '').toLowerCase();
  const server = (headers.server ?? '').toLowerCase();

  if (powered.includes('wordpress') || server.includes('wordpress')) {
    return { platformType: 'wordpress', signals: ['header:x-powered-by:wordpress'] };
  }
  if (powered.includes('wix')) {
    return { platformType: 'wix', signals: ['header:x-powered-by:wix'] };
  }
  if (server.includes('squarespace')) {
    return { platformType: 'squarespace', signals: ['header:server:squarespace'] };
  }
  return null;
}

export function detectPlatform(input: {
  url: string;
  html: string;
  headers?: Record<string, string>;
}): PlatformDetectionResult {
  const allSignals: string[] = [];
  let detectedPlatform: PlatformType = 'unknown';
  let requiresJs = false;

  // 1. Domain check — highest confidence
  let hostname = '';
  try {
    hostname = new URL(input.url).hostname;
  } catch {
    // ignore
  }

  const domainMatch = checkDomain(hostname);
  if (domainMatch) {
    return {
      platformType: domainMatch.platformType,
      requiresJs: ['eventbrite', 'dice', 'artsy', 'squarespace', 'wix'].includes(domainMatch.platformType),
      confidence: 'high',
      signals: domainMatch.signals
    };
  }

  // 2. Meta generator tag — high confidence
  const metaMatch = checkMetaTags(input.html);
  if (metaMatch) {
    allSignals.push(...metaMatch.signals);
    detectedPlatform = metaMatch.platformType;
    requiresJs = ['squarespace', 'wix', 'webflow'].includes(detectedPlatform);
    return { platformType: detectedPlatform, requiresJs, confidence: 'high', signals: allSignals };
  }

  // 3. Response headers — medium confidence
  if (input.headers) {
    const headerMatch = checkResponseHeaders(input.headers);
    if (headerMatch) {
      allSignals.push(...headerMatch.signals);
      detectedPlatform = headerMatch.platformType;
      requiresJs = ['wix', 'squarespace'].includes(detectedPlatform);
    }
  }

  // 4. HTML body signals — collect all, pick highest-priority match
  const htmlMatches = checkHtmlSignals(input.html);
  const platformPriority: PlatformType[] = [
    'eventbrite',
    'dice',
    'resident_advisor',
    'artsy',
    'artnet',
    'axiell',
    'gallery_systems',
    'wordpress',
    'squarespace',
    'wix',
    'webflow',
    'shopify',
    'drupal',
    'nextjs',
    'react',
    'vue',
    'angular'
  ];

  for (const priority of platformPriority) {
    const match = htmlMatches.find((m) => m.platformType === priority);
    if (match) {
      allSignals.push(...match.signals);
      if (detectedPlatform === 'unknown') {
        detectedPlatform = match.platformType;
        requiresJs = match.requiresJs;
      }
    }
  }

  if (detectedPlatform === 'unknown' && allSignals.length === 0) {
    return { platformType: 'unknown', requiresJs: false, confidence: 'low', signals: [] };
  }

  const confidence = detectedPlatform !== 'unknown' ? 'medium' : 'low';
  return { platformType: detectedPlatform, requiresJs, confidence, signals: allSignals };
}
