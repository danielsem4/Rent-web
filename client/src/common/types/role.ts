/**
 * Single source of truth for the four application roles. Mirrors the server's
 * role taxonomy (server/src/shared/constants/roles.ts). These are UX-only on the
 * client — the server is the real authorization boundary (SECURITY_PRINCIPLES.md).
 */
export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  COMPANY_MANAGER: "COMPANY_MANAGER",
  COMPANY_WORKER: "COMPANY_WORKER",
  RENTER: "RENTER",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
