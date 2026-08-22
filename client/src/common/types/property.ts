/**
 * A rental property. `entryCode` and owner PII are protected on the server and
 * only returned on a single-record read (GET /:id) — the list endpoint omits
 * `entryCode`, so it is optional here.
 */
export interface IProperty {
  id: number;
  companyId: number;
  city: string;
  address: string;
  entryCode?: string | null;
  electricMeter?: string | null;
  waterMeter?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  monthlyRent: number;
  /** Number of rooms in the apartment. Optional until the backend field lands. */
  rooms?: number | null;
  /** Maximum number of occupants the property can hold. */
  maxCapacity: number;
  /** Number of occupants currently living in the property. */
  total: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** List projection — same shape minus the protected `entryCode`. */
export type IPropertyListItem = Omit<IProperty, "entryCode">;

/** Writable payload for create/update (no server-owned fields). */
export interface IPropertyInput {
  city: string;
  address: string;
  entryCode?: string;
  electricMeter?: string;
  waterMeter?: string;
  ownerName?: string;
  ownerPhone?: string;
  contractStart?: string;
  contractEnd?: string;
  monthlyRent?: number;
  rooms?: number;
  maxCapacity?: number;
  total?: number;
  notes?: string;
}
