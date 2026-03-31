export interface BatchIntakeAnalysis {
  submittedUrls: string[];
  validUrls: string[];
  duplicateUrls: string[];
  formatWarnings: string[];
  invalidUrls: string[];
  estimatedCandidateYield: number;
}

const UNREACHABLE_SUFFIXES = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.pdf', '.zip'];

export function parseUrlLines(input?: string | null): string[] {
  if (!input) return [];
  return input
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function analyseBatchUrls(urls: string[], existingUrls: string[]): BatchIntakeAnalysis {
  const submittedUrls = urls.map((value) => value.trim()).filter(Boolean);
  const existing = new Set(existingUrls.map((value) => value.toLowerCase()));
  const seen = new Set<string>();

  const validUrls: string[] = [];
  const duplicateUrls: string[] = [];
  const formatWarnings: string[] = [];
  const invalidUrls: string[] = [];

  for (const candidate of submittedUrls) {
    const normalized = candidate.toLowerCase();
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      invalidUrls.push(candidate);
      continue;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      invalidUrls.push(candidate);
      continue;
    }

    if (seen.has(normalized) || existing.has(normalized)) {
      duplicateUrls.push(candidate);
      continue;
    }

    seen.add(normalized);
    validUrls.push(candidate);

    if (UNREACHABLE_SUFFIXES.some((suffix) => parsed.pathname.toLowerCase().endsWith(suffix))) {
      formatWarnings.push(candidate);
    }
  }

  const warningPenalty = Math.min(validUrls.length, formatWarnings.length);

  return {
    submittedUrls,
    validUrls,
    duplicateUrls,
    formatWarnings,
    invalidUrls,
    estimatedCandidateYield: Math.max(0, validUrls.length - warningPenalty)
  };
}

export interface QueueGroup<T> {
  key: string;
  count: number;
  records: T[];
}

export function groupByKey<T>(rows: T[], keyFn: (row: T) => string): QueueGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    const existing = map.get(key);
    if (existing) existing.push(row);
    else map.set(key, [row]);
  }

  return [...map.entries()]
    .map(([key, records]) => ({ key, count: records.length, records }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}
