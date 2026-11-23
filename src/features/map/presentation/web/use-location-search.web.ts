import { useEffect, useRef } from 'react';

import { useReactive } from '@/core/web/use-reactive.web';
import {
  rankResults,
  searchLocations,
  type LocationResult,
  type PickRole,
} from '@/features/map/data/services/swisstopo-search-service';

type SearchOptions = {
  locale: () => string;
  /** What is picked: a start or end point also finds stops and ranks access places first. */
  role: () => PickRole | undefined;
  /** Where the user looks: same-named places rank nearest first. Null: no answer wanted. */
  origin: () => { center: { lng: number; lat: number }; zoom: number } | null;
};

/**
 * The place search of a location pick (the crosshair picker, the route planner): debounced, the
 * latest query only, and a chosen result's name is not searched again. Use in a `'use no memo'`
 * component (its fields are Vue-like reactive state).
 */
export function useLocationSearch(options: SearchOptions) {
  const s = useReactive(() => ({
    query: '',
    results: [] as LocationResult[],
    failed: false,
    listOpen: false,
    /** The last result chosen; its name is in the field. */
    chosen: null as LocationResult | null,
  }));
  const latest = useRef(options);
  latest.current = options;
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    // Clearing the field also forgets the chosen result (no stale name on confirm).
    if (!s.query.trim()) s.chosen = null;
    const timer = setTimeout(async () => {
      controller.current?.abort();
      const own = new AbortController();
      controller.current = own;
      const trimmed = s.query.trim();
      if (trimmed.length < 2) {
        s.listOpen = false;
        return;
      }
      if (s.chosen?.name === trimmed) return;
      try {
        const { locale, role, origin } = latest.current;
        const found = await searchLocations(trimmed, locale(), own.signal, role());
        const at = origin();
        if (controller.current !== own || !at) return;
        s.results = rankResults(found, at.center, at.zoom, role());
        s.failed = false;
      } catch (err) {
        // Superseded or aborted on purpose: the newer run owns the list.
        if (
          controller.current !== own ||
          (err instanceof DOMException && err.name === 'AbortError')
        )
          return;
        s.results = [];
        s.failed = true;
      }
      s.listOpen = true;
    }, 300);
    return () => clearTimeout(timer);
  }, [s.query]);
  useEffect(() => () => controller.current?.abort(), []);

  /** Take `result`: its name goes into the field, the list closes. */
  function take(result: LocationResult) {
    s.chosen = result;
    s.query = result.name;
    s.listOpen = false;
  }

  return { state: s, take };
}
