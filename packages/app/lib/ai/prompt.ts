/**
 * Shared extraction prompt used by all AI providers.
 * Returns the user-facing prompt string for event data extraction.
 */
export function buildExtractionPrompt(input: {
  sourceUrl: string;
  extractedText: string;
}): string {
  return `Extract structured event data from this page.\n\nSource URL: ${input.sourceUrl}\nPage text:\n${input.extractedText.slice(0, 4000)}\n\nReturn a JSON object with these fields (omit fields you cannot find):\n{\n  "title": "string — event or exhibition title",\n  "startAt": "ISO 8601 datetime or date",\n  "endAt": "ISO 8601 datetime or date (if applicable)",\n  "timezone": "IANA timezone name if found",\n  "locationText": "venue name and/or address",\n  "description": "brief event description (max 300 chars)",\n  "artistNames": ["array of artist or performer names"],\n  "imageUrl": "URL of a representative image if found in the text"\n}\n\nFor each field you return, also return a confidence object:\n{\n  "confidence": {\n    "title": 0.0-1.0,\n    ...\n  }\n}\n\nAnd an evidence object with the sentence or phrase that supports each field:\n{\n  "evidence": {\n    "title": "the supporting text snippet",\n    ...\n  }\n}`;
}
