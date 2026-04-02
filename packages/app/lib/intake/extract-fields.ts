import type { PrismaClient } from '@/lib/prisma-client';
import { getActiveExtractionProvider } from '@/lib/ai/provider-selector';

export interface ExtractionResult {
  extractedFieldsJson: Record<string, unknown>;
  confidenceJson: Record<string, number>;
  evidenceJson: Record<string, string[]>;
  warningsJson: string[];
  modelVersion: string;
  parserVersion: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export async function extractFields(
  sourceDocument: {
    extractedText: string;
    sourceUrl: string;
    mode?: 'events' | 'artists' | 'artworks' | 'gallery' | 'auto';
  },
  prisma: PrismaClient
): Promise<ExtractionResult> {
  const provider = await getActiveExtractionProvider(prisma);
  return provider.extractFields(sourceDocument);
}
