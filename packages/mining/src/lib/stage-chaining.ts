export interface QueueLike {
  add(name: string, data: Record<string, unknown>, opts?: { jobId?: string }): Promise<unknown>;
}

export function nextStageJobId(stage: string, candidateId: string): string {
  return `${stage}:${candidateId}`;
}

export async function enqueueNextStage(queue: QueueLike, stage: string, candidateId: string) {
  // Idempotency assumption: workers can retry the same stage for one candidate.
  // We set deterministic BullMQ jobId so retries won't fan out duplicate downstream jobs.
  // This assumes completed jobs are retained (default BullMQ behavior) long enough to dedupe retry bursts.
  await queue.add(stage, { candidateId }, { jobId: nextStageJobId(stage, candidateId) });
}
