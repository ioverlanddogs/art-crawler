export interface ExtractionResult {
  extractedFieldsJson: Record<string, unknown>;
  confidenceJson: Record<string, number>;
  evidenceJson: Record<string, string[]>;
  warningsJson: string[];
  modelVersion: string;
  parserVersion: string;
}

export async function extractFields(sourceDocument: {
  extractedText: string;
  sourceUrl: string;
}): Promise<ExtractionResult> {
  const titleMatch = sourceDocument.extractedText.match(/<title[^>]*>(.*?)<\/title>/i);
  const fallbackTitle = new URL(sourceDocument.sourceUrl).hostname;
  const title = titleMatch?.[1]?.trim() || fallbackTitle;

  return {
    extractedFieldsJson: {
      title
    },
    confidenceJson: {
      title: 0.4
    },
    evidenceJson: {
      title: []
    },
    warningsJson: ['extraction_stub_active — replace with real model in Sprint 5'],
    modelVersion: 'stub-v0',
    parserVersion: 'regex-v0'
  };
}
