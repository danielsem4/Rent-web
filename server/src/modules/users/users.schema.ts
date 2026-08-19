import { z } from 'zod';

/**
 * Roles a COMPANY_MANAGER is permitted to create/assign. SUPER_ADMIN is
 * intentionally absent — any attempt to create or assign it fails validation
 * (400). This is the first line of role-escalation defense, enforced
 * server-side (never relying on the frontend hiding the option).
 */
const manageableRole = z.enum(['COMPANY_MANAGER', 'COMPANY_WORKER', 'RENTER']);

/**
 * Body for POST /api/users. Non-strict by project convention (no `.strict()`
 * anywhere in the codebase), so unknown keys — notably a client-supplied
 * `companyId` — are silently stripped. Company ownership is assigned by the
 * service from the trusted `req.currentUser.companyId`, never from the body.
 */
export const createUserSchema = z.object({
  email: z.string().email('A valid email is required'),
  name: z.string().min(1, 'Name is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: manageableRole,
});

/**
 * Body for PATCH /api/users/:id. Intentionally limited to name/email/role.
 * `companyId` and `password` are NOT accepted (ownership transfer and password
 * changes are out of scope for this module). At least one field is required.
 */
export const updateUserSchema = z
  .object({
    name: z.string().min(1, 'Name is required').optional(),
    email: z.string().email('A valid email is required').optional(),
    role: manageableRole.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
