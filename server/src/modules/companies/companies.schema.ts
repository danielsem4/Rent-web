import { z } from 'zod';
import { MODULE_VALUES, type ModuleKey } from '../../shared/modules/registry';

/**
 * Validation for the platform-admin company API (SUPER_ADMIN only). Unknown keys
 * are stripped by Zod's default object parsing; `companyId` is NEVER taken from a
 * body here — it comes from the `:id` path param (the super-admin is cross-tenant
 * by design, gated by `authorize(SUPER_ADMIN)`).
 */

const moduleKeySchema = z.enum(MODULE_VALUES as [ModuleKey, ...ModuleKey[]]);

const nameSchema = z.string().trim().min(1, 'companies.validation.nameRequired').max(120);
const emailSchema = z.string().trim().toLowerCase().email('companies.validation.emailInvalid');
const managerNameSchema = z.string().trim().min(1, 'companies.validation.managerNameRequired').max(120);

/** Optional first manager created alongside the company (invited, not password-set). */
const managerSchema = z.object({
  email: emailSchema,
  name: managerNameSchema,
});

export const createCompanySchema = z.object({
  name: nameSchema,
  // Modules to enable at creation. Defaults to none — a company may have no
  // modules (locked decision: all modules are independently optional).
  modules: z.array(moduleKeySchema).default([]),
  manager: managerSchema.optional(),
});

export const updateCompanySchema = z
  .object({
    name: nameSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, {
    message: 'companies.validation.nothingToUpdate',
  });

/** Declarative "here is the exact set of enabled modules" for a company. */
export const setModulesSchema = z.object({
  modules: z.array(moduleKeySchema),
});

export const createManagerSchema = managerSchema;

export type CreateCompanyDto = z.infer<typeof createCompanySchema>;
export type UpdateCompanyDto = z.infer<typeof updateCompanySchema>;
export type SetModulesDto = z.infer<typeof setModulesSchema>;
export type CreateManagerDto = z.infer<typeof createManagerSchema>;
