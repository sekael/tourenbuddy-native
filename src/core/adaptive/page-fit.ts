import { createContext } from 'react';

/**
 * iOS: inside a sheet as tall as its page (`Screen`'s `fit`), the page on top reports the height
 * its list needs, bar included; its sections sit close under the bar, without the band a list
 * leaves above its first section.
 */
export const PageFit = createContext<((height: number) => void) | null>(null);
