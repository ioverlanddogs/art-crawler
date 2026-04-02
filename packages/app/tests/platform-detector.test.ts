import { describe, expect, test } from 'vitest';
import { detectPlatform } from '@/lib/intake/platform-detector';

describe('detectPlatform', () => {
  test('detects eventbrite from domain with high confidence', () => {
    const result = detectPlatform({
      url: 'https://www.eventbrite.com/e/some-event-123',
      html: '<html><body>Event page</body></html>'
    });
    expect(result.platformType).toBe('eventbrite');
    expect(result.confidence).toBe('high');
    expect(result.requiresJs).toBe(true);
    expect(result.signals).toContain('domain:eventbrite');
  });

  test('detects wordpress from wp-content in HTML', () => {
    const result = detectPlatform({
      url: 'https://gallery.example.com/events',
      html: '<html><head><link rel="stylesheet" href="/wp-content/themes/main.css"></head></html>'
    });
    expect(result.platformType).toBe('wordpress');
    expect(result.signals.some((s) => s.includes('wp-content'))).toBe(true);
  });

  test('detects wordpress from meta generator tag', () => {
    const result = detectPlatform({
      url: 'https://gallery.example.com',
      html: '<html><head><meta name="generator" content="WordPress 6.4"></head></html>'
    });
    expect(result.platformType).toBe('wordpress');
    expect(result.confidence).toBe('high');
    expect(result.signals).toContain('meta:generator:wordpress');
  });

  test('detects squarespace from HTML content', () => {
    const result = detectPlatform({
      url: 'https://gallery.example.com',
      html: '<html><body><script src="https://static1.squarespace.com/main.js"></script></body></html>'
    });
    expect(result.platformType).toBe('squarespace');
    expect(result.requiresJs).toBe(true);
  });

  test('detects nextjs from _next/static path', () => {
    const result = detectPlatform({
      url: 'https://gallery.example.com',
      html: '<html><head><script src="/_next/static/chunks/main.js"></script></head></html>'
    });
    expect(result.platformType).toBe('nextjs');
    expect(result.requiresJs).toBe(true);
  });

  test('detects artsy from domain', () => {
    const result = detectPlatform({
      url: 'https://www.artsy.net/gallery/some-gallery',
      html: '<html></html>'
    });
    expect(result.platformType).toBe('artsy');
    expect(result.confidence).toBe('high');
  });

  test('returns unknown with low confidence for generic HTML', () => {
    const result = detectPlatform({
      url: 'https://gallery.example.com',
      html: '<html><body><h1>Welcome to our gallery</h1></body></html>'
    });
    expect(result.platformType).toBe('unknown');
    expect(result.confidence).toBe('low');
    expect(result.signals).toHaveLength(0);
  });

  test('detects platform from x-powered-by header', () => {
    const result = detectPlatform({
      url: 'https://gallery.example.com',
      html: '<html><body>content</body></html>',
      headers: { 'x-powered-by': 'WordPress', server: 'Apache' }
    });
    expect(result.platformType).toBe('wordpress');
    expect(result.signals).toContain('header:x-powered-by:wordpress');
  });

  test('prefers domain match over HTML signals', () => {
    const result = detectPlatform({
      url: 'https://www.eventbrite.com/e/event-123',
      html: '<html><body><script src="/wp-content/themes/main.js"></script></body></html>'
    });
    expect(result.platformType).toBe('eventbrite');
    expect(result.confidence).toBe('high');
  });

  test('detects wix from wixstatic.com in HTML', () => {
    const result = detectPlatform({
      url: 'https://user.wixsite.com/gallery',
      html: '<html><body><img src="https://static.wixstatic.com/image.jpg"></body></html>'
    });
    expect(result.platformType).toBe('wix');
    expect(result.requiresJs).toBe(true);
  });
});
