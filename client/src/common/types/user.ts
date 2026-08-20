import type { Role } from "./role";

export interface IUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}
