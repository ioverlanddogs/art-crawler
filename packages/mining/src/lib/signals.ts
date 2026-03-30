export function computeSignals(input: { title?: string; sourceUrl: string; platform: string }) {
  return {
    hasTitle: input.title ? 1 : 0,
    httpsSource: input.sourceUrl.startsWith('https://') ? 1 : 0,
    knownPlatform: ['instagram', 'eventbrite', 'generic'].includes(input.platform) ? 1 : 0
  };
}
