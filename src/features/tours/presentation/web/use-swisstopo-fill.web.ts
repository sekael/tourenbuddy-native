import { useEffect, useRef } from 'react';

import { useReactive } from '@/core/web/use-reactive.web';

/** A point confirmed in the location picker or the route planner, with what was looked up. */
export type PointPick = {
  type: 'goal' | 'start' | 'end';
  location: { lng: number; lat: number };
  name?: string;
  elevation?: number | null;
};

/** The route planner's Done: a moved point, or a start or end it removed. */
export type PointChange = PointPick | { type: 'start' | 'end'; location: null };

export type SwisstopoFillStatus = 'idle' | 'loading' | 'failed';

/**
 * One form field Swisstopo fills after a location pick. What the user typed is theirs: a pick
 * skips the field, and typing mid-lookup cancels the request, so no late answer overwrites it.
 * `field` reads and writes the form's value (the form keeps Vue-like state).
 */
export function useSwisstopoFill(field: { get: () => string; set: (value: string) => void }) {
  const state = useReactive(() => ({ status: 'idle' as SwisstopoFillStatus }));
  const m = useRef({ typed: false, controller: null as AbortController | null }).current;

  function cancel() {
    m.controller?.abort();
    m.controller = null;
    state.status = 'idle';
  }

  /** On the field's input (typing, paste, autofill, steppers). */
  function input() {
    m.typed = true;
    cancel();
  }

  /** A value already known lands at once: nothing in between to wait for. */
  async function fill(
    lookup: (signal: AbortSignal) => Promise<string | number | null> | string | number | null,
  ) {
    if (m.typed && field.get().trim()) return;
    cancel();
    const own = new AbortController();
    m.controller = own;
    m.typed = false;
    const answer = lookup(own.signal);
    if (answer instanceof Promise) {
      // The old value described the previous point: show the wait, not a stale answer.
      field.set('');
      state.status = 'loading';
    }
    const value = answer instanceof Promise ? await answer : answer;
    if (m.controller !== own) return;
    m.controller = null;
    field.set(value == null ? '' : String(value));
    state.status = value == null ? 'failed' : 'idle';
  }

  useEffect(() => cancel, []);
  return {
    get status() {
      return state.status;
    },
    fill,
    input,
    cancel,
  };
}

export type SwisstopoFill = ReturnType<typeof useSwisstopoFill>;
