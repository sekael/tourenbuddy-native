import { useEffect, useRef, useState } from 'react';
import { createStore } from 'zustand/vanilla';

export type SnackbarState = { visible: boolean; message: string };

// Every transient bottom message shares one spot. Showing one claims the slot and hides whichever
// message held it, so two never render on top of each other.
const slot = createStore<{ owner: object | null }>(() => ({ owner: null }));

/** Joins the app-wide snackbar slot: `hide` runs when another message claims it. Returns the claim. */
export function useSnackbarSlot(hide: () => void): () => void {
  const [owner] = useState(() => ({}));
  const hideRef = useRef(hide);
  useEffect(() => {
    hideRef.current = hide;
  });
  useEffect(
    () =>
      slot.subscribe((s) => {
        if (s.owner !== owner) hideRef.current();
      }),
    [owner],
  );
  return () => slot.setState({ owner });
}

/** A temporary snackbar message for a page or a sheet (the PWA's `useSnackbar`). */
export function useSnackbar(duration = 4000) {
  const [snackbar, setSnackbar] = useState<SnackbarState>({ visible: false, message: '' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = () => {
    if (timer.current) clearTimeout(timer.current);
    setSnackbar((s) => ({ ...s, visible: false }));
  };
  const claim = useSnackbarSlot(dismiss);
  const show = (message: string) => {
    if (timer.current) clearTimeout(timer.current);
    claim();
    setSnackbar({ visible: true, message });
    timer.current = setTimeout(() => setSnackbar((s) => ({ ...s, visible: false })), duration);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return { snackbar, show, dismiss };
}

/**
 * A flag that turns itself off after `ms` (the PWA's visible-plus-timer pattern), sharing the
 * snackbar slot. `show()` raises it again and restarts the timer.
 */
export function useTimedFlag(ms: number) {
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const claim = useSnackbarSlot(() => setOn(false));
  const show = () => {
    claim();
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), ms);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return [on, show, () => setOn(false)] as const;
}
