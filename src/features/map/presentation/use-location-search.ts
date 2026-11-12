import type { TFunction } from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isOnline } from '@/core/offline/online';
import {
  rankResults,
  searchLocations,
  type LocationResult,
  type PickRole,
} from '@/features/map/data/services/swisstopo-search-service';

import { useMapStore } from './stores/map-store';

/**
 * The place search of a pick (route step, point picks), ported from the PWA: debounced 300 ms, the
 * latest query only, results ranked nearest the map's view; a chosen result's name is not searched
 * again. Offline it answers nothing (the map still takes taps).
 */
export function useLocationSearch(role: PickRole) {
  const { i18n } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [failed, setFailed] = useState(false);
  const chosen = useRef<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2 || chosen.current === trimmed || !isOnline()) {
      setResults([]);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchLocations(trimmed, i18n.language, controller.signal, role)
        .then((found) => {
          if (controller.signal.aborted) return;
          const { center, zoom } = useMapStore.getState();
          setResults(
            rankResults(
              found,
              center ? { lng: center[0], lat: center[1] } : { lng: 8.23, lat: 46.8 },
              zoom ?? 8,
              role,
            ),
          );
          setFailed(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setResults([]);
          setFailed(true);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, role, i18n.language]);

  return {
    query,
    setQuery: (q: string) => {
      if (!q.trim()) chosen.current = null;
      setQuery(q);
    },
    results,
    failed,
    /** Takes a result: the list closes, its name is not searched again. */
    take: (result: LocationResult) => {
      chosen.current = result.name;
      setQuery('');
      setResults([]);
    },
  };
}

/** A result's second line: what it is (or where the hit came from) and its region. */
export function resultSubtitle(t: TFunction, result: LocationResult): string {
  return [
    result.kind ??
      t(`tours.picker.search.origin.${result.origin}` as 'tours.picker.search.origin.gazetteer'),
    result.region,
  ]
    .filter(Boolean)
    .join(' · ');
}
