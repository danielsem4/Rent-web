import { z } from 'zod';

/**
 * Zod schemas for the workers module (SECURITY_PRINCIPLES.md §10 — validation +
 * mass-assignment defense). Non-strict by project convention (no `.strict()`), so
 * unknown keys — notably a client-supplied `companyId`/`id`/timestamps — are
 * silently STRIPPED. Company ownership is always assigned by the service from the
 * trusted `req.currentUser.companyId`, never from the request body.
 *
 * `passportNumber` and `insurancePolicyNumber` are regulated identifiers: accepted
 * here, encrypted at rest by the repository, and never written to logs or the
 * audit trail (the service audits changed field NAMES only, never values).
 */

// Shared field validators, reused between create and update.
const nameHe = z.string().min(1, 'Hebrew name is required').max(120);
const nameEn = z.string().min(1, 'English name is required').max(120);
const nationality = z.string().min(1, 'Nationality is required').max(80);
const optionalText = z.string().max(120);
const documentNumber = z.string().max(64);
const notes = z.string().max(2000);
// Preferred language for the (deferred) AI-translation feature.
const preferredLanguage = z.enum(['th', 'hi', 'si', 'he']);
// Accept an ISO date string (what the client sends) and coerce to a Date for Prisma.
const dateField = z.coerce.date();
const propertyId = z.coerce.number().int().positive();

/** Body for POST /api/workers. Name (He/En) + nationality are required. */
export const createWorkerSchema = z.object({
  nameHe,
  nameEn,
  nationality,
  entryDate: dateField.optional(),
  preferredLanguage: preferredLanguage.optional(),
  passportNumber: documentNumber.optional(),
  passportExpiry: dateField.optional(),
  visaType: optionalText.optional(),
  visaExpiry: dateField.optional(),
  insuranceProvider: optionalText.optional(),
  insurancePolicyNumber: documentNumber.optional(),
  insuranceCoverageType: optionalText.optional(),
  insuranceExpiry: dateField.optional(),
  phone: optionalText.optional(),
  employer: optionalText.optional(),
  // `null` clears an assignment; a positive int assigns one.
  propertyId: propertyId.nullable().optional(),
  notes: notes.optional(),
});

/** Body for PATCH /api/workers/:id. Every field optional; at least one required. */
export const updateWorkerSchema = z
  .object({
    nameHe: nameHe.optional(),
    nameEn: nameEn.optional(),
    nationality: nationality.optional(),
    entryDate: dateField.optional(),
    preferredLanguage: preferredLanguage.optional(),
    passportNumber: documentNumber.optional(),
    passportExpiry: dateField.optional(),
    visaType: optionalText.optional(),
    visaExpiry: dateField.optional(),
    insuranceProvider: optionalText.optional(),
    insurancePolicyNumber: documentNumber.optional(),
    insuranceCoverageType: optionalText.optional(),
    insuranceExpiry: dateField.optional(),
    phone: optionalText.optional(),
    employer: optionalText.optional(),
    propertyId: propertyId.nullable().optional(),
    notes: notes.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateWorkerDto = z.infer<typeof createWorkerSchema>;
export type UpdateWorkerDto = z.infer<typeof updateWorkerSchema>;
