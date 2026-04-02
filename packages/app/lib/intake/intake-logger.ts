import type { Prisma, PrismaClient } from '@/lib/prisma-client';

export type IntakeStage =
  | 'fetch'
  | 'platform_detect'
  | 'extract'
  | 'parse'
  | 'match'
  | 'complete';

export type IntakeLogStatus = 'success' | 'failure' | 'warning' | 'info';

export interface IntakeLogDetail {
  httpStatus?: number;
  contentType?: string | null;
  finalUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  platformType?: string;
  platformConfidence?: string;
  requiresJs?: boolean;
  signals?: string[];
  modelVersion?: string;
  parserVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  warningsJson?: string[];
  matchType?: string;
  matchedEventId?: string | null;
  [key: string]: unknown;
}

export async function writeIntakeLog(
  prisma: PrismaClient,
  params: {
    sourceDocumentId: string;
    ingestionJobId?: string;
    stage: IntakeStage;
    status: IntakeLogStatus;
    message: string;
    detail?: IntakeLogDetail;
  }
): Promise<void> {
  try {
    await prisma.ingestionLog.create({
      data: {
        sourceDocumentId: params.sourceDocumentId,
        ingestionJobId: params.ingestionJobId ?? null,
        stage: params.stage,
        status: params.status,
        message: params.message,
        detail: params.detail ? (params.detail as Prisma.InputJsonValue) : undefined
      }
    });
  } catch {
    // Logging must never block the pipeline — swallow errors silently
  }
}
