import { TOUR_TYPE_COLORS } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { routeOrder } from '@/features/tours/domain/legs';

import {
  ACTIVITY_PREFIX,
  BLANK_IMAGE,
  BUCKET_COLORS,
  bucketOf,
  FALLBACK_COLOR,
  pieImageId,
} from './marker-images';

/**
 * Tours as the map's GeoJSON (map-integration): one point per tour at its goal, with what the
 * layers draw: the colour (or a pie for several), the activity glyph, badges, the label, and the
 * per-colour weights the clustered source sums into its pies (each tour counts once, split evenly
 * between its colours, so a cluster pie weights tours by their colours).
 */
export type TourFeatureProps = {
  id: string;
  name: string;
  color: string;
  pie: string | null;
  activity: string;
  completed: boolean;
  friend: boolean;
  linked: boolean;
  selected: boolean;
} & Record<`w${number}`, number>;

export function tourFeatures(
  tours: readonly Tour[],
  opts: { selectedId?: string | null; linkedIds?: ReadonlySet<string> } = {},
): GeoJSON.FeatureCollection<GeoJSON.Point, TourFeatureProps> {
  return {
    type: 'FeatureCollection',
    features: tours.map((tour) => {
      const types = routeOrder(tour);
      const buckets = types.length ? [...new Set(types.map(bucketOf))] : [BUCKET_COLORS.length - 1];
      const weights = Object.fromEntries(
        BUCKET_COLORS.map((_, b) => [`w${b}`, buckets.includes(b) ? 1 / buckets.length : 0]),
      ) as Record<`w${number}`, number>;
      return {
        type: 'Feature',
        id: tour.id,
        geometry: { type: 'Point', coordinates: [tour.goal.lng, tour.goal.lat] },
        properties: {
          id: tour.id,
          name: tour.name ?? '',
          color: types[0] ? TOUR_TYPE_COLORS[types[0]] : FALLBACK_COLOR,
          pie: pieImageId(types),
          activity: types[0] ? `${ACTIVITY_PREFIX}${types[0]}` : BLANK_IMAGE,
          completed: !!tour.completed,
          friend: !!tour.isFriendTour,
          linked: !!opts.linkedIds?.has(tour.id),
          selected: tour.id === opts.selectedId,
          ...weights,
        },
      };
    }),
  };
}

/** Tours whose goals sit on one spot (within ~1 m): a stack the map cannot split by zooming. */
export function sameSpot(points: readonly [number, number][]): boolean {
  if (points.length < 2) return false;
  const [lng0, lat0] = points[0]!;
  return points.every(([lng, lat]) => Math.abs(lng - lng0) < 1e-5 && Math.abs(lat - lat0) < 1e-5);
}
