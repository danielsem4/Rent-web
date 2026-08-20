import type { Role } from "./role";

export interface IUser {
  id: number;
  email: string;
  name: string;
  role: Role;
}

/**
 * A company member as returned by `GET /api/users` (manager-only). Carries the
 * `isActive` flag so the UI can distinguish active members from pending
 * (invited-but-not-yet-accepted) ones and count "active employees".
 */
export interface IEmployee {
  id: number;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
}
