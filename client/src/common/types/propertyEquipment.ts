export type EquipmentCondition = "NEW" | "GOOD" | "FAIR" | "BROKEN";

/** An inventory item as returned by GET /properties/:id/equipment. */
export interface IPropertyEquipment {
  id: number;
  companyId: number;
  propertyId: number;
  name: string;
  quantity: number;
  condition: EquipmentCondition;
  serialNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Writable payload for creating an item. */
export interface IPropertyEquipmentInput {
  name: string;
  quantity?: number;
  condition?: EquipmentCondition;
  serialNumber?: string;
  notes?: string;
}
