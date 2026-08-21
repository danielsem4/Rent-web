/**
 * Audit action + resource catalog (SECURITY_PRINCIPLES.md §18).
 *
 * A centralized, reviewable string catalog rather than a Prisma enum: the set of
 * audited actions grows as the product does, and a plain `String` column + this
 * TS union avoids a schema migration for every new action while keeping the
 * values type-checked at the call sites. Mirrors the `roles.ts` catalog style.
 */

export const AUDIT_ACTIONS = {
  // Authentication
  AUTH_LOGIN_SUCCESS: 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILED: 'AUTH_LOGIN_FAILED',
  AUTH_TOKEN_REFRESH: 'AUTH_TOKEN_REFRESH',
  AUTH_LOGOUT: 'AUTH_LOGOUT',
  // Two-factor authentication (email OTP)
  MFA_CHALLENGE_ISSUED: 'MFA_CHALLENGE_ISSUED',
  MFA_LOGIN_SUCCESS: 'MFA_LOGIN_SUCCESS',
  MFA_LOGIN_FAILED: 'MFA_LOGIN_FAILED',
  // User administration
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  // Property management
  PROPERTY_CREATED: 'PROPERTY_CREATED',
  PROPERTY_UPDATED: 'PROPERTY_UPDATED',
  PROPERTY_DELETED: 'PROPERTY_DELETED',
  // Foreign-worker management (records carry regulated PII — audit NAMES only)
  WORKER_CREATED: 'WORKER_CREATED',
  WORKER_UPDATED: 'WORKER_UPDATED',
  WORKER_DELETED: 'WORKER_DELETED',
  // Worker identity documents (files are regulated PII — audit docType/id only,
  // never the original filename or bytes)
  WORKER_DOCUMENT_UPLOADED: 'WORKER_DOCUMENT_UPLOADED',
  WORKER_DOCUMENT_DOWNLOADED: 'WORKER_DOCUMENT_DOWNLOADED',
  WORKER_DOCUMENT_DELETED: 'WORKER_DOCUMENT_DELETED',
  // Account lifecycle
  INVITATION_SENT: 'INVITATION_SENT',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  // Session
  // Emitted by refresh-token reuse detection (Batch 5): a replayed revoked/expired
  // token revokes the whole family + bumps tokenVersion. Also the action a future
  // admin disable/revoke endpoint should emit. Revocation triggered by a password
  // set/change is captured via `sessionsRevoked` metadata on the password events.
  SESSION_REVOKED: 'SESSION_REVOKED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const RESOURCE_TYPES = {
  USER: 'USER',
  AUTH: 'AUTH',
  COMPANY: 'COMPANY',
  PROPERTY: 'PROPERTY',
  WORKER: 'WORKER',
  WORKER_DOCUMENT: 'WORKER_DOCUMENT',
} as const;

export type ResourceType = (typeof RESOURCE_TYPES)[keyof typeof RESOURCE_TYPES];
