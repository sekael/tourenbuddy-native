import { useEffect } from 'react';

let refcount = 0;

/**
 * Suppresses document scroll while held, by putting `scroll-locked` on <html> (global.css). The map
 * route holds it for its lifetime, the calendar while its guided tour is up. Refcounted, so a page
 * leaving never strips the lock an arriving page just took.
 */
export function useScrollLock(active = true): void {
  useEffect(() => {
    if (!active) return;
    refcount += 1;
    if (refcount === 1) document.documentElement.classList.add('scroll-locked');
    return () => {
      refcount -= 1;
      if (refcount === 0) document.documentElement.classList.remove('scroll-locked');
    };
  }, [active]);
}
