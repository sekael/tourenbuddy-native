import { createContext, useContext } from 'react';

/**
 * Whether a sheet's page is the one showing: a page pushed over it keeps it mounted on iOS (the
 * navigation stack), so what it shows elsewhere (the map) waits until it is on top again.
 */
export const PageOnTop = createContext(true);

export const usePageOnTop = () => useContext(PageOnTop);
