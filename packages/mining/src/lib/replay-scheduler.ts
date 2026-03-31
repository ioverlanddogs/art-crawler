export type ReplayStage = 'fetch' | 'extract' | 'normalise' | 'score' | 'deduplicate' | 'enrich' | 'mature' | 'export';

export interface ReplayWindowInput {
  id: string;
  sourceUrl: string;
  scopeKey: string;
  preferredWindowStartHourUtc: number;
  expectedDurationMinutes: number;
  dryRun?: boolean;
  fromStage?: ReplayStage;
}

export interface ScheduledReplay {
  id: string;
  sourceUrl: string;
  scopeKey: string;
  scheduledAtIso: string;
  fromStage: ReplayStage;
  dryRun: boolean;
  mutatesLiveState: false;
  reason: string;
}

export function scheduleReplayWindows(inputs: ReplayWindowInput[], now = new Date()): ScheduledReplay[] {
  return [...inputs]
    .map((input) => {
      const scheduledAt = nextWindow(now, clamp(input.preferredWindowStartHourUtc, 0, 23));
      const fromStage = input.fromStage ?? 'fetch';
      const dryRun = input.dryRun ?? true;
      return {
        id: input.id,
        sourceUrl: input.sourceUrl,
        scopeKey: input.scopeKey,
        scheduledAtIso: scheduledAt.toISOString(),
        fromStage,
        dryRun,
        mutatesLiveState: false as const,
        reason: dryRun
          ? `Scheduled dry-run replay from ${fromStage} in low-impact window.`
          : `Scheduled operator-confirmed replay from ${fromStage}; canonical writes remain blocked.`
      };
    })
    .sort((a, b) => (a.scopeKey === b.scopeKey ? a.id.localeCompare(b.id) : a.scopeKey.localeCompare(b.scopeKey)));
}

function nextWindow(now: Date, hourUtc: number) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, 0, 0, 0));
  if (date.getTime() <= now.getTime()) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return date;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}
