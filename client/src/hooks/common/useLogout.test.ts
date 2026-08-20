import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuthStore } from "@/store/useAuthStore";
import { useMfaStore } from "@/store/useMfaStore";

const h = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("@/api/authApi", () => ({
  authApi: { logout: h.logout },
}));

import { useLogout } from "./useLogout";

const getLogout = () => renderHook(() => useLogout()).result.current;

const replace = vi.fn();

describe("useLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.logout.mockResolvedValue(undefined);
    replace.mockReset();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { replace },
    });
    useAuthStore.setState({
      user: { id: 1, email: "a@b.c", name: "A", role: "RENTER" },
      userId: 1,
    });
    useMfaStore.setState({ mfaToken: "tok" });
  });

  it("calls the server, clears both stores, and hard-redirects to /login", async () => {
    await getLogout()();

    expect(h.logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().userId).toBeNull();
    expect(useMfaStore.getState().mfaToken).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("still clears state and redirects if the server call fails", async () => {
    h.logout.mockRejectedValue(new Error("network"));

    await getLogout()();

    expect(useAuthStore.getState().user).toBeNull();
    expect(useMfaStore.getState().mfaToken).toBeNull();
    expect(replace).toHaveBeenCalledWith("/login");
  });
});
