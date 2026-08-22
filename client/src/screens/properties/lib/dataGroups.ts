/**
 * Feature flags for the property-detail data groups whose backend is built
 * incrementally. A panel renders its real data + query when its flag is `true`,
 * otherwise it shows a graceful "coming soon" placeholder — so the redesigned
 * tabbed screen ships before every backend lands. Flip one line as each API
 * module merges (see the build sequence in the plan).
 *
 * Overview (profile/owner/access/contract) and rent history use data that
 * already exists, so they are not gated here.
 */
export const GROUP_READY = {
  bills: true,
  equipment: true,
  guarantees: true,
  expenses: true,
  inspections: true,
} as const;

export type DataGroup = keyof typeof GROUP_READY;
