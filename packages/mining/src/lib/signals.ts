export interface SignalInput {
  title?: string;
  sourceUrl: string;
  platform: string;
  trustTier?: number;
  parserType?: string | null;
  extractionCompleteness?: number;
  sourceFailureCount?: number;
}

export function computeSignals(input: SignalInput) {
  const trustTier = Math.max(0, Math.min(input.trustTier ?? 0, 5));
  const extractionCompleteness = Math.max(0, Math.min(input.extractionCompleteness ?? 0, 1));
  return {
    hasTitle: input.title ? 1 : 0,
    httpsSource: input.sourceUrl.startsWith('https://') ? 1 : 0,
    knownPlatform: ['instagram', 'eventbrite', 'generic', 'museum_calendar', 'event_platform'].includes(input.platform) ? 1 : 0,
    trustTierScore: trustTier / 5,
    hasStructuredData: input.parserType === 'json_ld' ? 1 : 0,
    extractionCompleteness,
    sourcePerformance: 1 - Math.min((input.sourceFailureCount ?? 0) / 10, 1)
  };
}
