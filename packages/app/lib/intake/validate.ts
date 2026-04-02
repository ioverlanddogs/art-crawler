import { z } from 'zod';

export const EXTRACTION_MODES = ['events', 'artists', 'artworks', 'gallery', 'auto'] as const;
export type ExtractionModeInput = typeof EXTRACTION_MODES[number];

export const intakeSubmitSchema = z.object({
  sourceUrl: z.string().url(),
  sourceLabel: z.string().max(200).optional(),
  recordTypeOverride: z.enum(EXTRACTION_MODES).optional(),
  notes: z.string().max(1000).optional()
});

export type IntakeSubmitInput = z.infer<typeof intakeSubmitSchema>;
