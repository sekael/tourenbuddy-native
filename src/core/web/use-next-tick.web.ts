import { useLayoutEffect, useRef } from 'react';

/**
 * Vue's `nextTick` for a ported component: resolves once this component has committed the state
 * set before the call (its layout effects ran), or after a frame if nothing re-rendered.
 */
export function useNextTick(): () => Promise<void> {
  const waiting = useRef<(() => void)[]>([]);
  useLayoutEffect(() => {
    const pending = waiting.current;
    waiting.current = [];
    pending.forEach((resolve) => resolve());
  });
  return () =>
    new Promise<void>((resolve) => {
      waiting.current.push(resolve);
      requestAnimationFrame(() => resolve());
    });
}
