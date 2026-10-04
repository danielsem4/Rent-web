/**
 * Feature-module catalog (modular multi-tenancy).
 *
 * A company is entitled to a set of coarse feature "modules". Which modules a
 * company has is stored per-company in the `CompanyModule` table; the catalog of
 * modules that *exist* is defined here in code.
 *
 * A centralized, reviewable string catalog rather than a Prisma enum: the set of
 * modules grows as the product does, and a plain `String` column + this TS union
 * avoids a schema migration for every new module while keeping the keys
 * type-checked at the call sites. Mirrors the `roles.ts` / `auditActions.ts` style.
 */

export const MODULE_KEYS = {
  /** Core rental management: properties, payments, and property-detail groups. */
  CORE_RENT: 'core-rent',
  /** Foreign-worker management + the worker mobile app (auth/portal). */
  FOREIGN_WORKERS: 'foreign-workers',
  /** Analytics/reporting. Registerable now; the feature itself is not built yet. */
  ANALYTICS: 'analytics',
} as const;

export type ModuleKey = (typeof MODULE_KEYS)[keyof typeof MODULE_KEYS];

/** All module keys, e.g. for iteration/validation (Zod `.refine`, admin UI). */
export const MODULE_VALUES = Object.values(MODULE_KEYS) as ModuleKey[];

/** True iff `value` is a registered module key (narrows `string` → `ModuleKey`). */
export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_VALUES as string[]).includes(value);
}

/**
 * Per-module metadata. `apiPrefixes` / `navKeys` document which server routers and
 * client nav entries a module governs — the single place that mapping is recorded
 * for review. Enforcement itself is co-located with the routes (`requireModule`)
 * and the client nav filter; this catalog is the reference, not the mechanism.
 *
 * `buildable: false` marks a module that is registerable/toggleable but whose
 * feature does not exist yet (governs no routes/nav) — never wire a
 * `requireModule` for such a key until the feature ships.
 */
export interface ModuleDefinition {
  key: ModuleKey;
  /** i18n label key for the admin UI / client nav. */
  labelKey: string;
  /** API path prefixes this module governs (documentation / review aid). */
  apiPrefixes: string[];
  /** Client nav `to` paths this module governs (documentation / review aid). */
  navKeys: string[];
  /** Whether the feature behind this module is actually implemented. */
  buildable: boolean;
}

export const MODULE_CATALOG: ModuleDefinition[] = [
  {
    key: MODULE_KEYS.CORE_RENT,
    labelKey: 'modules.coreRent',
    apiPrefixes: ['/api/properties', '/api/payments', '/api/inspections'],
    navKeys: ['/properties'],
    buildable: true,
  },
  {
    key: MODULE_KEYS.FOREIGN_WORKERS,
    labelKey: 'modules.foreignWorkers',
    apiPrefixes: ['/api/workers', '/api/worker-auth', '/api/worker-portal'],
    navKeys: ['/workers'],
    buildable: true,
  },
  {
    key: MODULE_KEYS.ANALYTICS,
    labelKey: 'modules.analytics',
    apiPrefixes: [],
    navKeys: [],
    buildable: false,
  },
];
