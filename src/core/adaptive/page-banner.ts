import { createContext, type ReactNode } from 'react';

/**
 * An app-wide status every page shows as its first row, below its navigation bar (the offline
 * banner, offline-data-cache). The root layout provides it while there is something to say, so
 * `core/` never imports the feature.
 */
export const PageBanner = createContext<ReactNode>(null);
