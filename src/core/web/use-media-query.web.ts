import { useSyncExternalStore } from 'react';

/** Whether a media query matches, following changes (vueuse `useMediaQuery`). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** `true` from 600 px: the PWA's desktop layout (dialogs, side drawer). */
export const useIsDesktop = () => useMediaQuery('(min-width: 600px)');

/** A device whose primary pointer is coarse (touch). */
export const useIsTouch = () => useMediaQuery('(pointer: coarse)');

/** The visible viewport's height, following rotation and the URL bar (vueuse `useWindowSize`). */
export function useWindowHeight(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('resize', onChange);
      return () => window.removeEventListener('resize', onChange);
    },
    () => window.innerHeight,
  );
}
