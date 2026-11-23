import { useLayoutEffect, useState, type RefObject } from 'react';

/** VueUse's `useElementSize`: an element's size, kept current by a ResizeObserver. */
export function useElementSize(
  el: RefObject<HTMLElement | null>,
  { box = 'content-box' }: { box?: 'content-box' | 'border-box' } = {},
) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const target = el.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => {
      const sizes = box === 'border-box' ? entry!.borderBoxSize : entry!.contentBoxSize;
      setSize({ width: sizes[0]!.inlineSize, height: sizes[0]!.blockSize });
    });
    observer.observe(target, { box });
    return () => observer.disconnect();
  }, [el, box]);
  return size;
}
