// Ported from the PWA's features/tours/presentation/composables/use-route-metrics.ts.
import { useEffect, useState } from 'react';

import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { routeMetrics, type RouteMetrics } from '@/features/tours/domain/route-metrics';
import { withHeights } from '@/features/tours/presentation/use-route-metrics';

const UNKNOWN: RouteMetrics = { ascent: null, descent: null, distance: null };

/**
 * Route numbers per tour id (design D19): a tour with a track counts its track, given the
 * terrain's heights when it has none of its own. While the track loads its numbers stay unknown;
 * only a track that can't be had falls back to the point heights. Tracks are held per GPX path, so
 * a replaced track (a new path) reloads.
 */
export function useRouteMetrics(tours: Tour[]): Map<string, RouteMetrics> {
  const [tracks, setTracks] = useState(() => new Map<string, GeoJSON.FeatureCollection>());
  /** Paths whose track couldn't be had this time (offline and never cached, a broken file). */
  const [failed, setFailed] = useState(() => new Set<string>());
  const missing = tours.filter((x) => x.gpxFilepath && !tracks.has(x.gpxFilepath));
  const missingKey = missing.map((x) => x.gpxFilepath).join('|');

  useEffect(() => {
    let alive = true;
    for (const tour of missing as (Tour & { gpxFilepath: string })[]) {
      void loadGpxTrack(tour).then(async (track) => {
        const path = tour.gpxFilepath;
        // A failed load stays missing, so the next change retries it — as the map does.
        if (!track) {
          if (alive) setFailed((f) => new Set(f).add(path));
          return;
        }
        const full = await withHeights(track);
        if (!alive) return;
        setTracks((m) => new Map(m).set(path, full));
        setFailed((f) => {
          if (!f.has(path)) return f;
          const rest = new Set(f);
          rest.delete(path);
          return rest;
        });
      });
    }
    return () => {
      alive = false;
    };
  }, [missingKey]);

  return new Map(
    tours.map((x) => {
      if (!x.gpxFilepath) return [x.id, routeMetrics(x)];
      const track = tracks.get(x.gpxFilepath);
      if (track) return [x.id, routeMetrics(x, track)];
      return [x.id, failed.has(x.gpxFilepath) ? routeMetrics(x) : UNKNOWN];
    }),
  );
}
