import { create } from "zustand";

/**
 * Ephemeral second-factor login state. Holds the short-lived `mfaToken` handed
 * back by `/auth/login` between the login screen and the MFA challenge screen.
 *
 * Deliberately NOT persisted: `mfaToken` is a credential, so it must never touch
 * localStorage (client CLAUDE.md + SECURITY_PRINCIPLES.md). A page refresh clears
 * it by design — the MFA screen then redirects back to /login.
 */
interface MfaState {
  mfaToken: string | null;
  setChallenge: (mfaToken: string) => void;
  clear: () => void;
}

export const useMfaStore = create<MfaState>((set) => ({
  mfaToken: null,
  setChallenge: (mfaToken) => set({ mfaToken }),
  clear: () => set({ mfaToken: null }),
}));
