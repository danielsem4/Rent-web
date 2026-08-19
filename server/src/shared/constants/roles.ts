import { Role } from '@prisma/client';

/**
 * The single source of role names for application authorization code.
 *
 * `Role` is the Prisma-generated taxonomy (a string-union type + runtime const):
 *   SUPER_ADMIN | COMPANY_MANAGER | COMPANY_WORKER | RENTER
 *
 * Deriving from Prisma means the taxonomy is never hand-duplicated — the schema
 * remains the one place roles are defined.
 */
export { Role };

/** All role values, e.g. for iteration/validation. Derived from Prisma `Role`. */
export const ROLE_VALUES = Object.values(Role) as Role[];
