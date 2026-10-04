import type { ModuleKey } from "./module";

/** A company row in the platform-admin list. */
export interface ICompanyListItem {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  moduleKeys: string[];
  managerCount: number;
}

/** A company's manager (projection — no sensitive fields). */
export interface ICompanyManager {
  id: number;
  email: string;
  name: string;
  isActive: boolean;
}

/** Full company detail for the platform-admin detail view. */
export interface ICompanyDetail {
  id: number;
  name: string;
  isActive: boolean;
  createdAt: string;
  moduleKeys: string[];
  managers: ICompanyManager[];
}

/** Payload to create a company (optionally with its first manager). */
export interface ICreateCompanyInput {
  name: string;
  modules: ModuleKey[];
  manager?: { email: string; name: string };
}
