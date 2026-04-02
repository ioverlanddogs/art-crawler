import { describe, expect, test } from 'vitest';
import { buildExtractionPrompt } from '@/lib/ai/prompt';

describe('buildExtractionPrompt', () => {
  test('events mode includes event-specific fields', () => {
    const prompt = buildExtractionPrompt({
      sourceUrl: 'https://gallery.example.com/events',
      extractedText: 'Some event content',
      mode: 'events'
    });
    expect(prompt).toContain('startAt');
    expect(prompt).toContain('endAt');
    expect(prompt).toContain('locationText');
    expect(prompt).toContain('artistNames');
  });

  test('artists mode includes artist-specific fields', () => {
    const prompt = buildExtractionPrompt({
      sourceUrl: 'https://gallery.example.com/artist/jane-doe',
      extractedText: 'Artist bio content',
      mode: 'artists'
    });
    expect(prompt).toContain('artistName');
    expect(prompt).toContain('bio');
    expect(prompt).toContain('nationality');
    expect(prompt).toContain('representativeWorks');
    expect(prompt).not.toContain('startAt');
  });

  test('artworks mode includes artwork-specific fields', () => {
    const prompt = buildExtractionPrompt({
      sourceUrl: 'https://gallery.example.com/artwork/painting-1',
      extractedText: 'Artwork listing content',
      mode: 'artworks'
    });
    expect(prompt).toContain('medium');
    expect(prompt).toContain('dimensions');
    expect(prompt).toContain('availability');
    expect(prompt).not.toContain('startAt');
  });

  test('gallery mode includes venue-specific fields', () => {
    const prompt = buildExtractionPrompt({
      sourceUrl: 'https://gallery.example.com/about',
      extractedText: 'Gallery info content',
      mode: 'gallery'
    });
    expect(prompt).toContain('venueName');
    expect(prompt).toContain('openingHours');
    expect(prompt).toContain('currentExhibitions');
    expect(prompt).not.toContain('startAt');
  });

  test('auto mode includes pageType field', () => {
    const prompt = buildExtractionPrompt({
      sourceUrl: 'https://gallery.example.com/page',
      extractedText: 'Unknown page content',
      mode: 'auto'
    });
    expect(prompt).toContain('pageType');
    expect(prompt).toContain('event');
    expect(prompt).toContain('artist');
    expect(prompt).toContain('artwork');
    expect(prompt).toContain('gallery');
  });

  test('defaults to events mode when no mode is specified', () => {
    const withMode = buildExtractionPrompt({
      sourceUrl: 'https://gallery.example.com',
      extractedText: 'Content',
      mode: 'events'
    });
    const withoutMode = buildExtractionPrompt({
      sourceUrl: 'https://gallery.example.com',
      extractedText: 'Content'
    });
    expect(withMode).toBe(withoutMode);
  });

  test('truncates extractedText to 4000 chars', () => {
    const longText = 'x'.repeat(5000);
    const prompt = buildExtractionPrompt({
      sourceUrl: 'https://example.com',
      extractedText: longText,
      mode: 'events'
    });
    expect(prompt).toContain('x'.repeat(4000));
    expect(prompt).not.toContain('x'.repeat(4001));
  });

  test('includes source URL in all modes', () => {
    const url = 'https://gallery.example.com/specific-page';
    const modes = ['events', 'artists', 'artworks', 'gallery', 'auto'] as const;
    for (const mode of modes) {
      const prompt = buildExtractionPrompt({
        sourceUrl: url,
        extractedText: 'Content',
        mode
      });
      expect(prompt).toContain(url);
    }
  });
});
