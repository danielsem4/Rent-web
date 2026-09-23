import { z } from 'zod';

/**
 * Zod schema for enabling worker app access (SECURITY_PRINCIPLES.md §10). Non-strict,
 * so client-supplied ownership keys are stripped. `phone` is optional: when omitted,
 * the worker's existing `phone` is used; when present, it also updates the display
 * phone. Normalization to E.164 happens in the service.
 */
export const enableAppAccessSchema = z.object({
  phone: z.string().min(3).max(32).optional(),
});

export type EnableAppAccessDto = z.infer<typeof enableAppAccessSchema>;
