import api from "@/lib/axios";
import type { IPaymentListItem } from "@/common/types/payment";

interface ListResponse {
  payments: IPaymentListItem[];
}

export const paymentsApi = {
  /** Company payments (server enforces role + tenant scope). */
  async list(): Promise<IPaymentListItem[]> {
    const { data } = await api.get<ListResponse>("/payments");
    return data.payments;
  },

  /** Rent history for one property (server verifies parent ownership + tenant scope). */
  async listByProperty(propertyId: number): Promise<IPaymentListItem[]> {
    const { data } = await api.get<ListResponse>(`/properties/${propertyId}/payments`);
    return data.payments;
  },
};
