/**
 * Shared types for the AI extraction provider abstraction.
 * All providers implement AiExtractionProvider.
 */

export interface AiExtractionResult {
  extractedFieldsJson: Record<string, unknown>;
  confidenceJson: Record<string, number>;
  evidenceJson: Record<string, string[]>;
  warningsJson: string[];
  modelVersion: string;
  parserVersion: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface AiExtractionProvider {
  readonly name: 'anthropic' | 'openai' | 'gemini';
  readonly modelId: string;
  extractFields(input: {
    extractedText: string;
    sourceUrl: string;
    mode?: 'events' | 'artists' | 'artworks' | 'gallery' | 'auto';
  }): Promise<AiExtractionResult>;
}
