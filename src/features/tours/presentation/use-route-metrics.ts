import { useEffect, useState } from 'react';

import { isOnline } from '@/core/offline/online';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { getTrackProfile } from '@/features/tours/data/services/swisstopo-profile-service';
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';
import type { Tour } from '@/features/tours/domain/entities/tour';
import {
  routeMetrics,
  trackLines,
  trackMetrics,
  type RouteMetrics,
} from '@/features/tours/domain/route-metrics';

const UNKNOWN: RouteMetrics = { ascent: null, descent: null, distance: null };

/**
 * The track with a height on every point: as it is when it has them, else with the terrain's
 * along its lines (a drawn track, a file without `<ele>`); as it is when no profile can be had.
 */
async function withHeights(track: GeoJSON.FeatureCollection): Promise<GeoJSON.FeatureCollection> {
  if (trackMetrics(track).ascent !== null || !isOnline()) return track;
  const lines = trackLines(track).filter((line) => line.length > 1);
  const profiles = await Promise.all(
    lines.map((line) => getTrackProfile(line.map(([lng, lat]) => [lng!, lat!] as LngLat))),
  );
  if (profiles.length === 0 || profiles.some((p) => !p || p.heights.includes(null))) return track;
  return {
    type: 'FeatureCollection',
    features: profiles.map((p) => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: p!.line.map(([lng, lat], i) => [lng, lat, p!.heights[i]!]),
      },
    })),
  };
}

/**
 * A tour's route numbers (gpx-tracks): its track's when it has one, with the terrain's heights
 * when the file has none; unknown while the track loads (never the point estimate first), the
 * point heights only when the track can't be had.
 */
export function useRouteMetrics(tour: Tour | null): {
  metrics: RouteMetrics;
  track: GeoJSON.FeatureCollection | null;
} {
  const [loaded, setLoaded] = useState<{
    path: string;
    track: GeoJSON.FeatureCollection | null;
  } | null>(null);
  const path = tour?.gpxFilepath ?? null;

  useEffect(() => {
    if (!tour || !path) return;
    let alive = true;
    void loadGpxTrack({ id: tour.id, gpxFilepath: path })
      .then((track) => (track ? withHeights(track) : null))
      .catch(() => null)
      .then((track) => {
        if (alive) setLoaded({ path, track });
      });
    return () => {
      alive = false;
    };
    // The track is per file: an edit that keeps the file keeps it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  if (!tour) return { metrics: UNKNOWN, track: null };
  if (!path) return { metrics: routeMetrics(tour), track: null };
  if (loaded?.path !== path) return { metrics: UNKNOWN, track: null };
  return { metrics: routeMetrics(tour, loaded.track), track: loaded.track };
}
