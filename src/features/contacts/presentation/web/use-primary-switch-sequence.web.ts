import { useEffect, useRef, useState } from 'react';

/** Highlight fade (out, then in) and row move durations; the CSS reads them via custom properties. */
export const PRIMARY_FADE_MS = 320;
export const PRIMARY_MOVE_MS = 700;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Stages a primary-phone switch as three visible steps (#320): the old primary's highlight fades
 * out, the rows reorder, the new primary's highlight fades in. A newer target mid-sequence
 * restarts from wherever the list is. Without a previous primary, with no new one, or under
 * reduced motion, both follow immediately.
 */
export function usePrimarySwitchSequence(target: string | null) {
  const [orderId, setOrderId] = useState(target);
  const [highlightId, setHighlightId] = useState(target);
  const state = useRef({ run: 0, orderId: target, first: true });

  useEffect(() => {
    const s = state.current;
    if (s.first) {
      s.first = false;
      return;
    }
    const current = ++s.run;
    const setOrder = (id: string | null) => {
      s.orderId = id;
      setOrderId(id);
    };
    if (reducedMotion() || s.orderId === null || target === null) {
      setOrder(target);
      setHighlightId(target);
      return;
    }
    // Resolves true unless a newer switch (or unmount) took over meanwhile.
    const pause = (ms: number) =>
      new Promise<boolean>((resolve) => setTimeout(() => resolve(current === s.run), ms));
    setHighlightId(null);
    void (async () => {
      if (!(await pause(PRIMARY_FADE_MS))) return;
      if (s.orderId !== target) {
        setOrder(target);
        if (!(await pause(PRIMARY_MOVE_MS))) return;
      }
      setHighlightId(target);
    })();
  }, [target]);

  useEffect(() => {
    const s = state.current;
    return () => void s.run++;
  }, []);

  return { orderId, highlightId };
}
