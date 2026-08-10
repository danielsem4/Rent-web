export type Role = "SUPER_ADMIN" | "COMPANY_MANAGER" | "COMPANY_WORKER" | "RENTER";

export interface IUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  companyId: number;
}
