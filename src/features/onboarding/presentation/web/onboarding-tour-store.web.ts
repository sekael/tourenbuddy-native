import { create } from 'zustand';

/**
 * Lets the profile sheet's "Show app tour" ask the map page, which runs the tour, to (re)open it:
 * a counter, so two reopens in a row still change it.
 */
export const useOnboardingTourStore = create<{ reopenSignal: number; requestReopen: () => void }>()(
  (set) => ({
    reopenSignal: 0,
    requestReopen: () => set((s) => ({ reopenSignal: s.reopenSignal + 1 })),
  }),
);
