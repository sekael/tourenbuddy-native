import { useEffect, useState } from 'react';
import { createStore } from 'zustand/vanilla';

// Heights of every bottom sheet currently up. The tallest is published as `--sheet-inset` on
// <html> so bottom-anchored toasts sit above it instead of covering its actions (global.css). With a
// sheet stacked over another, closing the top one falls back to the one below.
const insets = new Map<symbol, number>();

/** The tallest open sheet's resting height (0 with none): the map area it covers. */
export const sheetInset = createStore(() => ({ px: 0 }));

function publish() {
  const root = document.documentElement.style;
  const px = insets.size === 0 ? 0 : Math.max(...insets.values());
  sheetInset.setState({ px });
  if (insets.size === 0) root.removeProperty('--sheet-inset');
  else root.setProperty('--sheet-inset', `${px}px`);
}

/** Returns a setter for this sheet's resting height; cleared on unmount. */
export function useSheetInset(): (px: number) => void {
  const [key] = useState(() => Symbol('sheet'));
  useEffect(
    () => () => {
      insets.delete(key);
      publish();
    },
    [key],
  );
  return (px: number) => {
    insets.set(key, px);
    publish();
  };
}
