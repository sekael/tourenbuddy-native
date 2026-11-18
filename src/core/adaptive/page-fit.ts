import { createContext } from 'react';

/**
 * iOS: inside a sheet as tall as its page (`Screen`'s `fit`), the page on top reports the height
 * its list needs, bar included; its sections sit close under the bar, without the band a list
 * leaves above its first section. `height` adds the bar to a list's content height: the bar's
 * inset is read once, from the first page that shows it, and is the same for every page of the
 * sheet (all have an inline bar), so a page pushed in has its full height at once, not first
 * without its bar.
 */
export const PageFit = createContext<{
  height: (contentHeight: number, offsetY: number) => number;
  report: (height: number) => void;
} | null>(null);
