export interface ICompanyManager {
  id: number;
  name: string;
  email: string;
}

export interface ICompany {
  id: number;
  name: string;
  createdAt: string;
  manager: ICompanyManager | null;
}
