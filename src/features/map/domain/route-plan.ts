import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import { pointMetrics } from '@/features/tours/domain/route-metrics';

/** The route step's points, in the order they are set (map-first-tour-creation D1). */
export const ROUTE_STEPS = ['start', 'goal', 'end'] as const;
export type RouteStep = (typeof ROUTE_STEPS)[number];

/** A set point with what the lookups found; `loading` until both have answered. */
export interface PlannedPoint {
  location: { lng: number; lat: number };
  name: string | null;
  elevation: number | null;
  loading: boolean;
}

export type RoutePoints = Record<RouteStep, PlannedPoint | null>;

/**
 * What the route step hands on (map-first-tour-creation D9): its points, and the line along the
 * ways between them as the tour's track — its goal marked — or null where the route goes straight.
 */
export interface RoutePlan {
  points: RoutePoints;
  track: DrawnTrack | null;
}

/** The step after `from` still open, in order; `from` itself once every later one is set. */
export function nextStep(points: RoutePoints, from: RouteStep): RouteStep {
  const after = ROUTE_STEPS.slice(ROUTE_STEPS.indexOf(from) + 1);
  return after.find((step) => !points[step]) ?? (points.goal ? from : 'goal');
}

/**
 * Climb and descent of the legs set so far, from the points' heights — the form's own rule
 * (`pointMetrics`). Null until a leg to or from the goal has both its heights: no number beats a
 * wrong 0 m.
 */
export function routeClimb({
  start,
  goal,
  end,
}: RoutePoints): { ascent: number; descent: number } | null {
  const known = (p: PlannedPoint | null) => p?.elevation != null;
  if (!known(goal) || !(known(start) || known(end))) return null;
  const { ascent, descent } = pointMetrics({
    elevation: goal!.elevation,
    startPoint: start?.location ?? null,
    startPointElevation: start?.elevation ?? null,
    endPoint: end?.location ?? null,
    endPointElevation: end?.elevation ?? null,
  });
  return { ascent: ascent ?? 0, descent: descent ?? 0 };
}
