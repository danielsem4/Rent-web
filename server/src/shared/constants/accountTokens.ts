import { AccountTokenType } from '@prisma/client';

/**
 * The single source of account-lifecycle token kinds for application code,
 * mirroring `roles.ts`. `AccountTokenType` is the Prisma-generated taxonomy
 * (a string-union type + runtime const): INVITATION | PASSWORD_RESET.
 *
 * Deriving from Prisma means the taxonomy is never hand-duplicated — the schema
 * remains the one place these are defined.
 */
export { AccountTokenType };
