import type { Tour } from '@/features/tours/domain/entities/tour';
import { haversineMeters } from '@/core/utils/haversine';
import { isSameGoal } from '@/features/tours/domain/distance';
import { flight } from '@/features/tours/domain/legs';

/**
 * A route's numbers (design D19): what a guide plans by, derived from data the tour already
 * holds — never typed, never guessed. `null` = not known.
 */
export interface RouteMetrics {
  /** Metres climbed. */
  ascent: number | null;
  /** Metres descended. */
  descent: number | null;
  /** Horizontal metres; only a track knows it. */
  distance: number | null;
}

const UNKNOWN: RouteMetrics = { ascent: null, descent: null, distance: null };

/**
 * A height swing counts only once it reaches this far from the last turning point, so recorder
 * noise on a flat stretch does not add up to phantom metres.
 * ponytail: one threshold for every recorder; barometric tracks could take less.
 */
const HYSTERESIS_M = 5;

type HeightPoints = Pick<
  Tour,
  'elevation' | 'startPoint' | 'startPointElevation' | 'endPoint' | 'endPointElevation'
> &
  Partial<Pick<Tour, 'goal' | 'legs' | 'tourTypes'>>;

/**
 * Climb and descent over the legs the tour has — start → goal, goal → end: every rise is climb and
 * every drop descent, whichever leg it is on (both gauge the day's effort). A leg the tour does not
 * have (no start, or no end: it ends at its goal), or one missing a height, adds nothing; the other
 * still counts. A round trip's end without a height of its own takes the start's. Counter-climbs
 * between the points are unknown, so these are the route's net numbers — as SAC states them per
 * stage.
 */
export function pointMetrics(tour: HeightPoints): RouteMetrics {
  const { startPoint: start, endPoint: end, elevation: goal } = tour;
  const endHeight =
    tour.endPointElevation ??
    (start && end && isSameGoal(end, start) ? tour.startPointElevation : null);
  const legs = [
    ...(start ? [[tour.startPointElevation, goal]] : []),
    ...(end ? [[goal, endHeight]] : []),
  ];
  const rises = legs.flatMap(([from, to]) => (from == null || to == null ? [] : [to - from]));
  return {
    ascent: Math.round(rises.reduce((sum, d) => sum + Math.max(d, 0), 0)),
    descent: Math.round(rises.reduce((sum, d) => sum + Math.max(-d, 0), 0)),
    distance: null,
  };
}

export function trackLines(track: GeoJSON.FeatureCollection): GeoJSON.Position[][] {
  return track.features.flatMap(({ geometry: g }) => {
    if (g?.type === 'LineString') return [g.coordinates];
    return g?.type === 'MultiLineString' ? g.coordinates : [];
  });
}

interface LngLat {
  lng: number;
  lat: number;
}

/** A track's first and last point (lines in file order); null for a track without points. */
export function trackEnds(
  track: GeoJSON.FeatureCollection,
): { first: LngLat; last: LngLat } | null {
  const points = trackLines(track).flat();
  const [first, last] = [points[0], points.at(-1)];
  return first && last
    ? { first: { lng: first[0]!, lat: first[1]! }, last: { lng: last[0]!, lat: last[1]! } }
    : null;
}

/** Index of the line's vertex nearest `point`. */
function nearestVertex(line: readonly GeoJSON.Position[], point: LngLat): number {
  let best = Number.POSITIVE_INFINITY;
  let index = 0;
  line.forEach((p, i) => {
    const d = haversineMeters(p as [number, number], [point.lng, point.lat]);
    if (d < best) {
      best = d;
      index = i;
    }
  });
  return index;
}

function lineLength(line: readonly GeoJSON.Position[]) {
  return line.reduce(
    (sum, p, i) =>
      i > 0 ? sum + haversineMeters(line[i - 1] as [number, number], p as [number, number]) : sum,
    0,
  );
}

/** Share of the line's length (0–1) at its vertex nearest `point`; 0 for a line without length. */
export function progressNearest(line: readonly GeoJSON.Position[], point: LngLat): number {
  const total = lineLength(line);
  return total > 0 ? lineLength(line.slice(0, nearestVertex(line, point) + 1)) / total : 0;
}

/** Horizontal distance, climb and descent along a GPX track; heights stay unknown if any point lacks one. */
export function trackMetrics(track: GeoJSON.FeatureCollection): RouteMetrics {
  const lines = trackLines(track).filter((line) => line.length > 0);
  if (lines.length === 0) return UNKNOWN;
  let distance = 0;
  let ascent = 0;
  let descent = 0;
  let heights = true;
  for (const line of lines) {
    let level: number | undefined;
    line.forEach((p, i) => {
      if (i > 0)
        distance += haversineMeters(line[i - 1] as [number, number], p as [number, number]);
      const h = p[2];
      if (h === undefined) {
        heights = false;
        return;
      }
      if (level === undefined) {
        level = h;
      } else if (Math.abs(h - level) >= HYSTERESIS_M) {
        if (h > level) ascent += h - level;
        else descent += level - h;
        level = h;
      }
    });
  }
  return {
    ascent: heights ? Math.round(ascent) : null,
    descent: heights ? Math.round(descent) : null,
    distance: Math.round(distance),
  };
}

function asTrack(coordinates: GeoJSON.Position[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }],
  };
}

/**
 * A way's numbers: a walked one's every rise and drop and its distance, a flown one's net change
 * alone — a thermal is not legwork, and the flight's line says nothing about the day's legwork.
 * Heights stay unknown if any point lacks one.
 */
function wayMetrics(line: GeoJSON.Position[], flown: boolean): RouteMetrics {
  const walked = trackMetrics(asTrack(line));
  if (!flown) return walked;
  if (walked.ascent === null) return UNKNOWN;
  const rise = Math.round(line.at(-1)![2]! - line[0]![2]!);
  return { ascent: Math.max(rise, 0), descent: Math.max(-rise, 0), distance: null };
}

/**
 * A track with a way flown whole (activity-legs; a lone glider's way down too), cut at the vertex
 * nearest the goal into its ways, each counted as `wayMetrics` says: the distance is the walked
 * way's, none for a day flown both ways. Null when no way is flown whole, or the track can't be
 * cut: the whole track counts.
 * ponytail: a multi-line track, or a way flown only in part, counts the whole track, thermals
 * included — cutting the flight out of a way needs the launch.
 */
function flownTrackMetrics(
  tour: HeightPoints,
  track: GeoJSON.FeatureCollection,
): RouteMetrics | null {
  const geometry = track.features.length === 1 ? track.features[0]!.geometry : null;
  const flown = flight({ tourTypes: tour.tourTypes ?? [], legs: tour.legs });
  const [upFlown, downFlown] = [flown.up?.length === 1, flown.down?.length === 1];
  if (!tour.goal || geometry?.type !== 'LineString' || !(upFlown || downFlown)) return null;
  const line = geometry.coordinates;
  const cut = nearestVertex(line, tour.goal);
  const up = wayMetrics(line.slice(0, cut + 1), upFlown);
  const down = wayMetrics(line.slice(cut), downFlown);
  const sum = (key: 'ascent' | 'descent') =>
    up[key] === null || down[key] === null ? null : up[key] + down[key];
  return { ascent: sum('ascent'), descent: sum('descent'), distance: up.distance ?? down.distance };
}

/**
 * The most accurate numbers the tour has: its track's when the track has heights, else the point
 * heights' climb and descent, with the track's distance.
 */
export function routeMetrics(
  tour: HeightPoints,
  track?: GeoJSON.FeatureCollection | null,
): RouteMetrics {
  const points = pointMetrics(tour);
  if (!track) return points;
  const fromTrack = flownTrackMetrics(tour, track) ?? trackMetrics(track);
  return fromTrack.ascent === null ? { ...points, distance: fromTrack.distance } : fromTrack;
}

/** Sum per number of the routes that know it; unknown only when none does. */
export function totalMetrics(routes: readonly RouteMetrics[]): RouteMetrics {
  const total = (key: keyof RouteMetrics) => {
    const known = routes.map((r) => r[key]).filter((v) => v !== null);
    return known.length > 0 ? known.reduce((sum, v) => sum + v, 0) : null;
  };
  return { ascent: total('ascent'), descent: total('descent'), distance: total('distance') };
}

/** Ski touring: the climb on skins, the run down on skis. */
const SKI_TOURING = new Set<string>(['skitour', 'splitboarding', 'ski-mountaineering']);
const ON_TRAILS = new Set<string>(['hiking', 'trailrunning']);
/** What the rule of thumb times: legwork, on foot or on touring skis — not a day by lift, bike or air. */
const TIMED = new Set<string>([...SKI_TOURING, ...ON_TRAILS, 'mountaineering']);

/** On skis: a ski-touring activity, and none on the trails (hiking wins a mixed day). */
export function onSkis(tourTypes: readonly string[]): boolean {
  return tourTypes.some((t) => SKI_TOURING.has(t)) && !tourTypes.some((t) => ON_TRAILS.has(t));
}

/**
 * Time on the way in minutes, by the Swiss rule of thumb (SAC, DIN 33466): 4 km/h on the flat,
 * 300 m an hour up and 500 m down; the shorter of horizontal and vertical time counts half. On skis
 * the climb goes at 400 m an hour and the run down is quick. `pace` is the user's speed as a factor
 * on the rule's (the swisstopo app's tortoise → hare): 1.25 takes 4/5 of the time. Null without a
 * distance.
 */
export function estimatedMinutes(
  { distance, ascent, descent }: RouteMetrics,
  skis = false,
  pace = 1,
): number | null {
  if (!distance) return null;
  const flat = distance / 4000;
  const vertical = (ascent ?? 0) / (skis ? 400 : 300) + (descent ?? 0) / (skis ? 1500 : 500);
  return Math.round(((Math.max(flat, vertical) + Math.min(flat, vertical) / 2) * 60) / pace);
}

/** SAC's time label ("04:30 h") in minutes at the standard pace; null for any other wording. */
export function labelMinutes(label: string): number | null {
  const hm = /^(\d+):(\d{2}) h$/.exec(label);
  return hm ? Number(hm[1]) * 60 + Number(hm[2]) : null;
}

/**
 * A tour's time at the user's pace: on skis for a ski tour; none for a day of lifts, bikes or
 * climbing alone, and none where a way is flown — the rule times legwork, and a flight's drop is none.
 */
export function tourMinutes(
  metrics: RouteMetrics,
  tour: Parameters<typeof flight>[0],
  pace: number,
): number | null {
  const { up, down } = flight(tour);
  const types = tour.tourTypes;
  if (up || down || (types.length > 0 && !types.some((t) => TIMED.has(t)))) return null;
  return estimatedMinutes(metrics, onSkis(types), pace);
}
