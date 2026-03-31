import { z } from 'zod';

export const intakeSubmitSchema = z.object({
  sourceUrl: z.string().url(),
  sourceLabel: z.string().max(200).optional(),
  recordTypeOverride: z.string().max(50).optional(),
  notes: z.string().max(1000).optional()
});

export type IntakeSubmitInput = z.infer<typeof intakeSubmitSchema>;
