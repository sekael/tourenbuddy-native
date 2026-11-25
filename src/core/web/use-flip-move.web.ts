import { useLayoutEffect, useRef } from 'react';

/**
 * The PWA's `<TransitionGroup>` move (FLIP) for a keyed list whose order changes: each child
 * carries `data-flip-key`; when the key order changes, children glide from their old place with
 * `moveClass` (which holds the transform transition). Returns the container ref.
 */
export function useFlipMove<T extends HTMLElement>(keys: readonly string[], moveClass: string) {
  'use no memo';
  const ref = useRef<T>(null);
  const order = useRef<string | null>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);
  const classNames = moveClass.split(' ').filter(Boolean);

  // Render runs before the DOM changes: the last moment the old positions can be read.
  const next = keys.join('\n');
  if (order.current !== next) {
    if (order.current !== null && ref.current && !before.current)
      before.current = new Map(
        [...(ref.current.children as HTMLCollectionOf<HTMLElement>)].map((el) => [
          el.dataset.flipKey ?? '',
          el.getBoundingClientRect(),
        ]),
      );
    order.current = next;
  }

  useLayoutEffect(() => {
    const old = before.current;
    before.current = null;
    if (!old || !ref.current) return;
    const moved: HTMLElement[] = [];
    for (const el of ref.current.children as HTMLCollectionOf<HTMLElement>) {
      const from = old.get(el.dataset.flipKey ?? '');
      if (!from) continue;
      el.classList.remove(...classNames);
      el.style.transform = '';
      const to = el.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      if (!dx && !dy) continue;
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.transitionDuration = '0s';
      moved.push(el);
    }
    if (!moved.length) return;
    void document.body.offsetHeight; // commit the inverted positions before animating
    for (const el of moved) {
      el.classList.add(...classNames);
      el.style.transform = '';
      el.style.transitionDuration = '';
      const end = (e: TransitionEvent) => {
        if (e.target !== el || !e.propertyName.endsWith('transform')) return;
        el.classList.remove(...classNames);
        el.removeEventListener('transitionend', end);
      };
      el.addEventListener('transitionend', end);
    }
  });

  return ref;
}
