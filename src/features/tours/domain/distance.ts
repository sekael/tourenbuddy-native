import { wgs84ToLv95 } from '@/core/utils/wgs84-to-lv95';

export function isSameGoal(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
  thresholdMeters = 10,
): boolean {
  const lv95a = wgs84ToLv95(a.lng, a.lat);
  const lv95b = wgs84ToLv95(b.lng, b.lat);
  const dE = lv95a.easting - lv95b.easting;
  const dN = lv95a.northing - lv95b.northing;
  return Math.sqrt(dE * dE + dN * dN) <= thresholdMeters;
}

/** A track's end this close to the goal is the goal; ends this close together make a loop. */
export const TRACK_END_NEAR_M = 200;

type Spot = { lng: number; lat: number };
type Pair = readonly [number, number];

/**
 * A track's first and last point as the route's start and end (tour-form-extended "GPX fills
 * empty points"): an end at the goal is the goal (null: a tour without an end ends there), and a
 * loop ends exactly at its start.
 */
export function lineEnds<P extends Pair>(
  first: P,
  last: P,
  goal: Spot | null,
): { start: P | null; end: P | null } {
  const spot = ([lng, lat]: Pair): Spot => ({ lng, lat });
  const atGoal = (p: P) => !!goal && isSameGoal(spot(p), goal, TRACK_END_NEAR_M);
  const start = atGoal(first) ? null : first;
  if (atGoal(last)) return { start, end: null };
  return {
    start,
    end: start && isSameGoal(spot(first), spot(last), TRACK_END_NEAR_M) ? start : last,
  };
}
