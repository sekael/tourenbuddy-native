import type { TrailOverlayId } from '@/features/map/data/trail-overlays';
import type { TourType } from '@/features/tours/data/models/tour-type';
import { flight, type TourLegs } from '@/features/tours/domain/legs';
import { onSkis } from '@/features/tours/domain/route-metrics';

/** What a drawn line follows first, before the base map's roads and paths; null = those ways alone. */
export type SnapNetwork = TrailOverlayId;

/**
 * A drawing follows what the map shows first: the hiking trails, the ski routes, or — both shown —
 * the ones the tour's activity goes on. Ski touring picks the ski routes; hiking wins when both are
 * picked, and when the activity says neither. Every way of the base map comes after them.
 */
export function snapNetworkFor(
  overlays: readonly TrailOverlayId[],
  tourTypes: readonly string[],
): SnapNetwork | null {
  const hiking = overlays.includes('hiking');
  const ski = overlays.includes('ski');
  if (hiking && ski) return onSkis(tourTypes) ? 'ski' : 'hiking';
  return hiking ? 'hiking' : ski ? 'ski' : null;
}

/** What a planned or drawn line follows: a network first (then every way), or nothing: straight. */
export type Follow = SnapNetwork | 'straight';

/**
 * Where a route or drawing starts: an activity on skis follows the ski routes, any other activity
 * the hiking trails; without one, what the map shows (hiking first).
 */
export function initialFollow(
  overlays: readonly TrailOverlayId[],
  tourTypes: readonly string[],
): SnapNetwork {
  if (onSkis(tourTypes)) return 'ski';
  if (tourTypes.length) return 'hiking';
  return snapNetworkFor(overlays, tourTypes) ?? 'hiking';
}

/** A route's two ways: start → goal (up) and goal → end (down). */
export type Way = 'up' | 'down';

/** What each way of a route follows. */
export type Follows = Record<Way, Follow>;

/**
 * What a way's legs follow (activity-legs): a straight line where the way is flown whole (the
 * glider alone on it), else the network its own activities go on, as `initialFollow` picks it —
 * hike & fly walks up the hiking trails and flies straight to the landing.
 */
export function wayFollow(
  overlays: readonly TrailOverlayId[],
  tour: { tourTypes: readonly TourType[]; legs?: TourLegs | null },
  way: Way,
): Follow {
  if (flight(tour)[way]?.length === 1) return 'straight';
  const types = (way === 'up' ? tour.legs?.ascent : tour.legs?.descent) ?? tour.tourTypes;
  return initialFollow(overlays, types);
}
