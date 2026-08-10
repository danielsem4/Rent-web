export interface IProperty {
  id: number;
  companyId: number;
  city: string;
  address: string;
  entryCode: string | null;
  electricMeter: string | null;
  waterMeter: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  contractStart: string | null; // ISO date string
  contractEnd: string | null; // ISO date string
  monthlyRent: number;
  capacity: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IPropertyStats {
  activeApartments: number;
  openTickets: number; // placeholder until the Tickets slice lands
  collectionRate: number | null; // placeholder until the Ledger slice lands
}

// Grid visual-indicator states (spec §3A). Payment/tickets show their
// default/zero state until the Ledger/Tickets domains are built.
export type PaymentStatus = "paid" | "overdue" | "future";
