import { z } from 'zod';

/**
 * Zod schemas for the properties module (SECURITY_PRINCIPLES.md §11 — validation +
 * mass-assignment defense). Non-strict by project convention (no `.strict()`
 * anywhere in the codebase), so unknown keys — notably a client-supplied
 * `companyId`, `id`, or timestamps — are silently STRIPPED. Company ownership is
 * always assigned by the service from the trusted `req.currentUser.companyId`,
 * never from the request body.
 *
 * `entryCode` and owner PII (`ownerName`/`ownerPhone`) are protected assets
 * (threat model): they are accepted here but never written to logs or the audit
 * trail (the service audits changed field NAMES only, never values).
 */

// Shared field validators, reused between create and update so the rules stay in
// one place. Optional text fields cap length defensively; numeric fields are
// bounded to the DB's non-negative / positive-capacity invariants.
const city = z.string().min(1, 'City is required').max(120);
const address = z.string().min(1, 'Address is required').max(200);
const optionalText = z.string().max(200);
const monthlyRent = z.coerce.number().int('Monthly rent must be a whole number').min(0);
const capacity = z.coerce.number().int('Capacity must be a whole number').min(1);
// Accept an ISO date string (what the client sends) and coerce to a Date for Prisma.
const contractDate = z.coerce.date();

/**
 * Body for POST /api/properties. `city` + `address` are required; everything else
 * is optional (the DB supplies defaults for `monthlyRent`/`capacity`).
 */
export const createPropertySchema = z.object({
  city,
  address,
  entryCode: optionalText.optional(),
  electricMeter: optionalText.optional(),
  waterMeter: optionalText.optional(),
  ownerName: optionalText.optional(),
  ownerPhone: optionalText.optional(),
  contractStart: contractDate.optional(),
  contractEnd: contractDate.optional(),
  monthlyRent: monthlyRent.optional(),
  capacity: capacity.optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Body for PATCH /api/properties/:id. Every field is optional, but at least one
 * must be provided. `companyId`/`id`/timestamps are never accepted (ownership
 * transfer is out of scope for this module).
 */
export const updatePropertySchema = z
  .object({
    city: city.optional(),
    address: address.optional(),
    entryCode: optionalText.optional(),
    electricMeter: optionalText.optional(),
    waterMeter: optionalText.optional(),
    ownerName: optionalText.optional(),
    ownerPhone: optionalText.optional(),
    contractStart: contractDate.optional(),
    contractEnd: contractDate.optional(),
    monthlyRent: monthlyRent.optional(),
    capacity: capacity.optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreatePropertyDto = z.infer<typeof createPropertySchema>;
export type UpdatePropertyDto = z.infer<typeof updatePropertySchema>;
