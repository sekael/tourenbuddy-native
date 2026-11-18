import { createContext } from 'react';

/**
 * A way back that is not in the navigation stack (the guided tour a feature was opened from):
 * every page in a sheet offers it as its first row (the tabs have their bar's accessory). The root
 * layout provides it while there is one, the tabs take it away, so `core/` never imports the
 * feature.
 */
export const PageReturn = createContext<{ label: string; onPress: () => void } | null>(null);
