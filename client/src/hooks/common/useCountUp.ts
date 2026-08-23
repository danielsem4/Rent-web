import { useEffect, useRef, useState } from "react";

/** True when the user asked the OS to reduce motion (or we can't tell — jsdom,
 *  older browsers — in which case we default to "reduced" so nothing animates
 *  where we can't confirm it's safe). */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animate a number from 0 up to `target` once, on mount and whenever `target`
 * changes, using an ease-out curve over `durationMs`. When the user prefers
 * reduced motion the hook returns `target` verbatim (no state, no animation) —
 * so the final value is always correct immediately for tests, SSR, and a11y.
 */
export function useCountUp(target: number, durationMs = 600): number {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) return;

    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs, reduced]);

  return reduced ? target : value;
}
