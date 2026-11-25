import { useSyncExternalStore } from 'react';

/**
 * How far the visible area is panned down from the layout viewport's top (iOS pans it while the
 * keyboard is up). 0 on desktop, without `visualViewport`, and while pinch-zoomed.
 */
export function useVisualViewportTop(): number {
  return useSyncExternalStore(
    (onChange) => {
      const vv = window.visualViewport;
      vv?.addEventListener('resize', onChange);
      vv?.addEventListener('scroll', onChange);
      return () => {
        vv?.removeEventListener('resize', onChange);
        vv?.removeEventListener('scroll', onChange);
      };
    },
    () => {
      const vv = window.visualViewport;
      return !vv || vv.scale > 1.01 ? 0 : Math.round(vv.offsetTop);
    },
  );
}
