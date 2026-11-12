import type { z } from 'zod';
import type { Season } from '@/features/tours/data/models/season';
import type { TourOuting, tourSchema } from '@/features/tours/data/models/tour-schema';
import type { TourType } from '@/features/tours/data/models/tour-type';
import type { Visibility } from '@/features/tours/data/models/visibility';
import type { TourLegs } from '@/features/tours/domain/legs';

/** Domain entity for a tour. */
export type Tour = z.infer<typeof tourSchema>;

/** Draft used when creating a new tour (before location is set). */
export interface TourDraft {
  name: string | null;
  plannedDate: Date | null;
  /** Span end, inclusive. Null = single-day tour. Never before `plannedDate`. */
  endDate: Date | null;
  partnerIds: string[];
  /** Activity types in `TOUR_TYPE_VALUES` order; empty = untyped. */
  tourTypes: TourType[];
  elevation: number | null;
  gpxFilepath: string | null;
  description: string | null;
  seasons: Season[] | null;
  startPoint: { lng: number; lat: number } | null;
  endPoint: { lng: number; lat: number } | null;
  startPointName: string | null;
  startPointElevation: number | null;
  endPointName: string | null;
  endPointElevation: number | null;
  equipment: string | null;
  notes: string | null;
  /** Free text in the activity's own scale ("T4", "ZS-"); null = none. */
  grade?: string | null;
  /** "HH:MM" on `plannedDate`; null = none. */
  startTime?: string | null;
  /**
   * Activities per leg (activity-legs); null = all both ways. `undefined` = keep the tour's
   * while its activities don't change (the server's rule for a caller that knows no legs).
   */
  legs?: TourLegs | null;
  completed?: boolean;
  /** Owner-chosen visibility. Defaults to `friends` server-side when omitted. */
  visibility?: Visibility;
  /**
   * Outing membership (#338). `undefined` = keep the tour's current one (the form never sets
   * it, so an edit can't drop a segment out of its outing); `null` = standalone.
   */
  outing?: TourOuting | null;
}

/**
 * Lift a pre-#335 single `tourType` into `tourTypes`. Cached snapshots and queued drafts are
 * structured-cloned without a zod parse, so data written by an older build reaches the app
 * in its old shape; online fetches always parse and never need this.
 * ponytail: drop once no pre-#335 cache or outbox entry can be left (with the DB compat shims).
 */
export function withTourTypes<T extends { tourTypes: TourType[] }>(value: T): T {
  const legacy = value as T & { tourType?: TourType | null };
  if (legacy.tourTypes) return value;
  const { tourType, ...rest } = legacy;
  return { ...rest, tourTypes: tourType ? [tourType] : [] } as unknown as T;
}

/** Converts a tour to a GeoJSON Feature for MapLibre rendering. */
export function tourToGeoJsonFeature(
  tour: Tour,
  opts?: { linkedTourIds?: Set<string> },
): GeoJSON.Feature<GeoJSON.Point> {
  return {
    type: 'Feature',
    id: tour.id,
    geometry: {
      type: 'Point',
      coordinates: [tour.goal.lng, tour.goal.lat],
    },
    properties: {
      id: tour.id,
      // Primary type: drives every single-colour `match` (glyph tints, fallbacks). A split
      // multi-colour fill is layered on top by the marker layer (`pieKey`).
      tourType: tour.tourTypes[0] ?? null,
      completed: tour.completed,
      isFriendTour: tour.isFriendTour ?? false,
      isLinked: opts?.linkedTourIds?.has(tour.id) ?? false,
    },
  };
}

/** Converts an array of tours to a GeoJSON FeatureCollection. */
export function toursToGeoJson(
  tours: Tour[],
  opts?: { linkedTourIds?: Set<string> },
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: tours.map((t) => tourToGeoJsonFeature(t, opts)),
  };
}
