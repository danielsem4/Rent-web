import api from "@/lib/axios";
import type { IUtilityBill } from "@/common/types/propertyBill";

interface ListResponse {
  utilityBills: IUtilityBill[];
}

export const propertyBillsApi = {
  async list(propertyId: number): Promise<IUtilityBill[]> {
    const { data } = await api.get<ListResponse>(`/properties/${propertyId}/utility-bills`);
    return data.utilityBills;
  },
};
