import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat, SkiRouteInfo } from '@/features/map/domain/entities/trail';
import type { TourDraft } from '@/features/tours/domain/entities/tour';
import { haversineMeters } from '@/core/utils/haversine';
import { searchLocations } from '@/features/map/data/services/swisstopo-search-service';
import { trackFromLine } from '@/features/map/domain/drawn-track';
import {
  buildNetwork,
  metersPerUnit,
  routeBetween,
  snapTo,
  toLngLat,
  toUnits,
} from '@/features/map/domain/track-routing';
import { getElevation } from '@/features/tours/data/services/swisstopo-elevation-service';

interface Point {
  lng: number;
  lat: number;
}

/** The summit named like the route's target must lie this close to the route. */
const SUMMIT_NEAR_M = 1500;

/** The place named like `targetName` nearest the route (`toRoute` metres), if close enough. */
async function findSummit(
  targetName: string,
  lang: string,
  toRoute: (p: Point) => number,
): Promise<Point | undefined> {
  // "Furggegütsch (Hohgant)": the place search knows the summit without its massif.
  const query = targetName.replace(/\s*\([^)]*\)\s*$/, '').trim();
  try {
    const found = await searchLocations(query, lang, new AbortController().signal);
    return found
      .filter((r) => r.name.trim().toLowerCase() === query.toLowerCase())
      .map((r) => ({ point: { lng: r.lng, lat: r.lat }, distance: toRoute(r) }))
      .filter((r) => r.distance <= SUMMIT_NEAR_M)
      .sort((a, b) => a.distance - b.distance)[0]?.point;
  } catch {
    return undefined;
  }
}

/** Parts of one route meet within this distance (a variant drawn off the main line). */
const PARTS_JOIN_M = 20;

/** The route's parts as one network, with its loose ends: where no other part meets a part's end. */
function routeNetwork(lines: LngLat[][], lat: number) {
  const mpu = metersPerUnit(lat);
  const net = buildNetwork(
    lines.map((line) => ({ points: line.map(toUnits), cost: 1 })),
    PARTS_JOIN_M / mpu,
  );
  const degree = new Map(net.nodes.map((n, i) => [n.join(), net.edges[i]!.length]));
  const ends = lines.filter((line) => line.length > 0).flatMap((line) => [line[0]!, line.at(-1)!]);
  return { net, mpu, loose: ends.filter((p) => degree.get(toUnits(p).join()) === 1) };
}

/**
 * The route's line from `start` up to the point nearest `goal` (#352), its parts joined into one
 * way, then down to `end`: another loose end for a traverse, back the same way to `start` for most
 * routes, nowhere when null (no descent). Without a way through the parts, its longest part, run
 * from the end nearer `start` and back.
 */
export function routeLine(
  lines: LngLat[][],
  start: LngLat,
  goal: LngLat,
  end: LngLat | null,
): LngLat[] {
  const { net, mpu } = routeNetwork(lines, goal[1]);
  const reach = (SUMMIT_NEAR_M + 100) / mpu;
  const along = (from: LngLat, to: LngLat) => {
    const [a, b] = [snapTo(net, toUnits(from), reach), snapTo(net, toUnits(to), reach)];
    const path = a && b && routeBetween(net, a, b)?.points;
    return path && path.length > 1 ? path.map(toLngLat) : null;
  };
  const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), []);
  const up =
    along(start, goal) ??
    (haversineMeters(longest[0]!, start) <= haversineMeters(longest.at(-1)!, start)
      ? longest
      : [...longest].reverse());
  if (!end) return up;
  const down = along(goal, end)?.slice(1) ?? up.slice(0, -1).reverse();
  return [...up, ...down];
}

/**
 * Where the tour starts and ends among the route's loose ends: the one lying the route's climb
 * below its summit, and the one its descent below. For a traverse ("from Binn, down to
 * Ausserbinn") they differ; for most routes they are one, the way down the way up. Without heights
 * or the route's figures, the end farthest from the goal, both ways.
 */
function startAndEnd(ends: LngLat[], heights: (number | null)[], route: SkiRouteInfo, goal: Point) {
  const fromGoal = (p: LngLat) => haversineMeters([goal.lng, goal.lat], p);
  const farthest = ends.reduce((far, p) => (fromGoal(p) > fromGoal(far) ? p : far));
  const { targetAltitude: top, ascentM: up, descentM: down } = route;
  const known = ends
    .map((p, i) => ({ p, h: heights[i] }))
    .filter((e): e is { p: LngLat; h: number } => e.h != null);
  const at = (height: number) =>
    known.reduce((a, b) => (Math.abs(b.h - height) < Math.abs(a.h - height) ? b : a)).p;
  const measured = top != null && up != null && down != null && known.length > 0;
  return {
    start: measured ? at(top - up) : farthest,
    end: down === 0 ? null : measured ? at(top - down) : farthest,
  };
}

/**
 * A ski route as a tour to plan (design D7 of smarter-tour-creation): the goal on the route's
 * target summit, the track from the route end its climb lies below it (`startAndEnd`) — the form
 * takes start and end from it — activity ski tour, the route's grade, and its name and SAC link as
 * description.
 *
 * The summit comes from the place search (the target by name, nearest the route): a route's ends
 * don't reliably hold it — a multi-part route can end on a variant. Without the search (offline,
 * no match) the route's last point is the goal, which holds for most routes (foot → summit).
 * The route's own line comes along as the track (#352): up to the summit and down to the route's
 * end — so the tour's climb and descent are the route's.
 */
export async function planFromRoute(
  route: SkiRouteInfo,
  lines: LngLat[][],
  lang: string,
): Promise<{ goal: Point; seed: TourDraft; track: DrawnTrack } | null> {
  const ends = lines.filter((line) => line.length > 0).flatMap((line) => [line[0]!, line.at(-1)!]);
  if (ends.length === 0) return null;
  const vertices = lines.flat();
  const toRoute = (p: Point) =>
    Math.min(...vertices.map((v) => haversineMeters([p.lng, p.lat], v)));
  // A loop has no loose end: any part end may start it.
  const { loose } = routeNetwork(lines, ends[0]![1]);
  const candidates = loose.length > 0 ? loose : ends;

  const [summit, heights] = await Promise.all([
    findSummit(route.targetName, lang, toRoute),
    Promise.all(candidates.map(([lng, lat]) => getElevation({ lng, lat }))),
  ]);
  const [lng, lat] = ends.at(-1)!;
  const goal = summit ?? { lng, lat };
  const { start, end } = startAndEnd(candidates, heights, route, goal);

  return {
    goal,
    track: trackFromLine(routeLine(lines, start, [goal.lng, goal.lat], end)),
    seed: {
      name: route.targetName,
      plannedDate: null,
      endDate: null,
      partnerIds: [],
      tourTypes: ['skitour'],
      elevation: route.targetAltitude,
      gpxFilepath: null,
      description: [route.name, route.sacUrl].filter(Boolean).join('\n') || null,
      seasons: null,
      // The track sets start and end, as any track does, and the form names and measures them.
      startPoint: null,
      endPoint: null,
      startPointName: null,
      startPointElevation: null,
      endPointName: null,
      endPointElevation: null,
      equipment: null,
      notes: null,
      grade: route.difficulty,
      startTime: null,
    },
  };
}
