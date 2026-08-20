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
};
