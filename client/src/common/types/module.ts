/**
 * Single source of truth for the feature-module keys (modular multi-tenancy).
 * Mirrors the server registry (server/src/shared/modules/registry.ts). UX-only on
 * the client — the server's requireModule is the real boundary
 * (SECURITY_PRINCIPLES.md).
 */
export const MODULE_KEYS = {
  CORE_RENT: "core-rent",
  FOREIGN_WORKERS: "foreign-workers",
  ANALYTICS: "analytics",
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

/** Ordered module list for the admin UI. `labelKey` resolves via i18n. */
export const MODULES: { key: ModuleKey; labelKey: string }[] = [
  { key: MODULE_KEYS.CORE_RENT, labelKey: "modules.core-rent" },
  { key: MODULE_KEYS.FOREIGN_WORKERS, labelKey: "modules.foreign-workers" },
  { key: MODULE_KEYS.ANALYTICS, labelKey: "modules.analytics" },
];
