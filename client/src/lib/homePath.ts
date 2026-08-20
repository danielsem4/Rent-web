/**
 * Central post-login destination by role. Every role lands on the dashboard today;
 * when per-role home screens exist, branch here and every caller updates at once.
 */
export function homePathForRole(_role: string): string {
  return "/";
}
