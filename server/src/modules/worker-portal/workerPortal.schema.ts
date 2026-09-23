import { z } from 'zod';

/**
 * Zod schema for worker-portal writes (SECURITY_PRINCIPLES.md §10). Non-strict, so
 * a client-supplied `workerId`/`companyId`/`status` is silently STRIPPED — those are
 * always set server-side from the worker principal (mass-assignment defense).
 */

/** Body for POST /api/worker-portal/requests. */
export const createRequestSchema = z.object({
  type: z.enum(['MAINTENANCE', 'GENERAL']),
  message: z.string().min(1, 'A message is required').max(2000),
});

export type CreateRequestDto = z.infer<typeof createRequestSchema>;
