import { useEffect, useLayoutEffect, type RefObject } from 'react';

type ExitSpec = { frames: Keyframe[]; duration: string; easing: string };
type Token = (name: string) => string;

/** One quiet fade: the default exit for sheets and their scrims. */
export const fadeOut = (token: Token): ExitSpec => ({
  frames: [{ opacity: 1 }, { opacity: 0 }],
  duration: token('--motion-duration-short'),
  easing: token('--motion-ease-standard'),
});

/**
 * Exit animation for a surface whose owner unmounts it (a sheet swapped for a full-screen page):
 * once React removed it, the element goes back where it was, inert, plays `keyframes` and is
 * removed. If it is still connected, an ancestor's leave transition animates it, so nothing is
 * done. `keyframes` reads the motion tokens off the element, so reduced motion applies.
 */
export function useExitAnimation(
  ref: RefObject<HTMLElement | null>,
  keyframes: (token: Token) => ExitSpec,
) {
  const saved = {
    node: null as HTMLElement | null,
    parent: null as Node | null,
    next: null as Node | null,
    spec: null as ExitSpec | null,
  };

  // Layout cleanup runs while the element is still in the document: remember where it was.
  useLayoutEffect(
    () => () => {
      const node = ref.current;
      if (!node) return;
      const style = getComputedStyle(node);
      Object.assign(saved, {
        node,
        parent: node.parentNode,
        next: node.nextSibling,
        spec: keyframes((name) => style.getPropertyValue(name).trim()),
      });
    },
    // Captured once per mount; the latest `keyframes` is read at unmount.

    [],
  );

  // Passive cleanup runs after React removed it: put the ghost back and fade it out.
  useEffect(
    () => () => {
      const { node: ghost, parent, next, spec } = saved;
      if (
        !ghost ||
        !spec ||
        ghost.isConnected ||
        !parent?.isConnected ||
        typeof ghost.animate !== 'function'
      )
        return;
      ghost.inert = true;
      ghost.style.pointerEvents = 'none';
      // Re-inserting restarts CSS keyframes (entrances); global.css stops them here.
      ghost.setAttribute('data-exiting', '');
      parent.insertBefore(ghost, next?.parentNode === parent ? next : null);
      ghost
        .animate(spec.frames, {
          duration: Number.parseFloat(spec.duration) || 0,
          easing: spec.easing,
          fill: 'forwards',
        })
        .finished.catch(() => {})
        .finally(() => ghost.remove());
    },

    [],
  );
}
