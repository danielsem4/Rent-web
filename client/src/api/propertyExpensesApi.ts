import api from "@/lib/axios";
import type { IPropertyExpense } from "@/common/types/propertyExpense";

interface ListResponse {
  expenses: IPropertyExpense[];
}

export const propertyExpensesApi = {
  async list(propertyId: number): Promise<IPropertyExpense[]> {
    const { data } = await api.get<ListResponse>(`/properties/${propertyId}/expenses`);
    return data.expenses;
  },
};
