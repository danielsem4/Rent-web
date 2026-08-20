import api from "@/lib/axios";
import type { IUser } from "@/common/types/user";

interface UserResponse {
  user: IUser;
}

/** Raw shape of a POST /auth/login response (either branch). */
interface LoginResponseBody {
  user?: IUser;
  mfaRequired?: boolean;
  mfaToken?: string;
}

/** Normalised login result the hooks branch on. */
export type LoginResult =
  | { status: "session"; user: IUser }
  | { status: "mfa"; mfaToken: string };

export const authApi = {
  async login(email: string, password: string): Promise<LoginResult> {
    const { data } = await api.post<LoginResponseBody>("/auth/login", {
      email,
      password,
    });
    if (data.mfaRequired && data.mfaToken) {
      return { status: "mfa", mfaToken: data.mfaToken };
    }
    return { status: "session", user: data.user as IUser };
  },

  /** Second-factor login: verify the emailed code and receive a real session. */
  async mfaChallenge(mfaToken: string, code: string): Promise<IUser> {
    const { data } = await api.post<UserResponse>("/auth/mfa/challenge", {
      mfaToken,
      code,
    });
    return data.user;
  },

  /** Re-send the emailed code; returns a fresh mfaToken. */
  async mfaResend(mfaToken: string): Promise<string> {
    const { data } = await api.post<{ mfaToken: string }>("/auth/mfa/resend", {
      mfaToken,
    });
    return data.mfaToken;
  },

  async me(): Promise<IUser> {
    const { data } = await api.get<UserResponse>("/auth/me");
    return data.user;
  },

  async logout(): Promise<void> {
    await api.post("/auth/logout");
  },
};
