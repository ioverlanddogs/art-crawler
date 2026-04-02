/**
 * Shared extraction prompt used by all AI providers.
 * Returns the user-facing prompt string for event data extraction.
 */
export type ExtractionMode = 'events' | 'artists' | 'artworks' | 'gallery' | 'auto';

export function buildExtractionPrompt(input: {
  sourceUrl: string;
  extractedText: string;
  mode?: ExtractionMode;
}): string {
  const mode = input.mode ?? 'events';
  const text = input.extractedText.slice(0, 4000);
  const base = `Source URL: ${input.sourceUrl}\nPage text:\n${text}`;

  if (mode === 'artists') {
    return `Extract structured data about artists or performers from this page.\n\n${base}\n\nReturn a JSON object with these fields (omit fields you cannot find):\n{\n  "artistName": "full name of the artist or performer",\n  "bio": "brief biography (max 300 chars)",\n  "nationality": "country or nationality",\n  "birthYear": "year of birth as a number",\n  "medium": "primary medium or discipline (e.g. painting, sculpture, performance)",\n  "representativeWorks": ["array of notable work titles"],\n  "websiteUrl": "artist website URL if found",\n  "imageUrl": "URL of a portrait or representative image"\n}\n\nFor each field you return, also return a confidence object:\n{\n  "confidence": { "artistName": 0.0-1.0, ... }\n}\n\nAnd an evidence object with the supporting text snippet for each field:\n{\n  "evidence": { "artistName": "the supporting text", ... }\n}`;
  }

  if (mode === 'artworks') {
    return `Extract structured data about artworks from this page.\n\n${base}\n\nReturn a JSON object with these fields (omit fields you cannot find):\n{\n  "title": "title of the artwork",\n  "artistName": "name of the artist",\n  "year": "year created as a number",\n  "medium": "materials and technique (e.g. oil on canvas)",\n  "dimensions": "dimensions as a string (e.g. 120 x 80 cm)",\n  "description": "brief description (max 300 chars)",\n  "price": "price as a string if listed (e.g. £12,000)",\n  "availability": "available, sold, on loan, or unknown",\n  "imageUrl": "URL of the artwork image"\n}\n\nFor each field you return, also return a confidence object:\n{\n  "confidence": { "title": 0.0-1.0, ... }\n}\n\nAnd an evidence object:\n{\n  "evidence": { "title": "the supporting text", ... }\n}`;
  }

  if (mode === 'gallery') {
    return `Extract structured data about this gallery, museum, or venue from this page.\n\n${base}\n\nReturn a JSON object with these fields (omit fields you cannot find):\n{\n  "venueName": "name of the gallery or museum",\n  "address": "full address",\n  "openingHours": "opening hours as a string",\n  "phone": "telephone number",\n  "email": "contact email address",\n  "currentExhibitions": ["array of current exhibition titles"],\n  "admissionInfo": "admission price or free entry note",\n  "websiteUrl": "main website URL",\n  "imageUrl": "URL of a representative venue image"\n}\n\nFor each field you return, also return a confidence object:\n{\n  "confidence": { "venueName": 0.0-1.0, ... }\n}\n\nAnd an evidence object:\n{\n  "evidence": { "venueName": "the supporting text", ... }\n}`;
  }

  if (mode === 'auto') {
    return `Examine this page and extract the most relevant structured data.\n\nFirst determine what type of page this is: event/exhibition listing, artist profile, artwork listing, or gallery/venue info.\n\n${base}\n\nReturn a JSON object. Include a "pageType" field set to one of: "event", "artist", "artwork", "gallery", "unknown".\n\nThen include the most relevant fields for that page type. For events: title, startAt, endAt, locationText, description, artistNames. For artists: artistName, bio, medium. For artworks: title, artistName, medium, year. For galleries: venueName, address, openingHours, currentExhibitions.\n\nFor each field you return, also return a confidence object:\n{\n  "confidence": { "pageType": 0.0-1.0, ... }\n}\n\nAnd an evidence object:\n{\n  "evidence": { "pageType": "the supporting text", ... }\n}`;
  }

  // Default: events
  return `Extract structured event data from this page.\n\n${base}\n\nReturn a JSON object with these fields (omit fields you cannot find):\n{\n  "title": "string — event or exhibition title",\n  "startAt": "ISO 8601 datetime or date",\n  "endAt": "ISO 8601 datetime or date (if applicable)",\n  "timezone": "IANA timezone name if found",\n  "locationText": "venue name and/or address",\n  "description": "brief event description (max 300 chars)",\n  "artistNames": ["array of artist or performer names"],\n  "imageUrl": "URL of a representative image if found in the text"\n}\n\nFor each field you return, also return a confidence object:\n{\n  "confidence": { "title": 0.0-1.0, ... }\n}\n\nAnd an evidence object with the sentence or phrase that supports each field:\n{\n  "evidence": { "title": "the supporting text snippet", ... }\n}`;
}
