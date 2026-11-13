import { z } from 'zod';

import { haversineMeters } from '@/core/utils/haversine';
import { loadNetworkLines, TooFarError } from '@/features/map/data/services/trail-network-service';
import { SKI_ROUTES_TILEJSON } from '@/features/map/data/trail-overlays';
import { lineLength, pointAlong } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import type { SnapNetwork } from '@/features/map/domain/snap-network';
import {
  buildNetwork,
  metersPerUnit,
  routeToTap,
  snapTo,
  toLngLat,
  toUnits,
  type Network,
} from '@/features/map/domain/track-routing';

/**
 * Legs along the ways (track-drawing, tour-creation-flow), ported from the PWA's `use-leg-router`:
 * A* over the ways in the tiles around a leg's two points, the way the drawing joins its taps and
 * the route step its points. Plain TypeScript: the sheets hold one router each.
 */

/** How far apart two ways may lie and still meet: tile-cut trails touch. */
const JOIN_M = 3;
/** How far a way's loose end reaches across to another. */
const BRIDGE_M = 30;
/** A leg looks this far around its two points (plus half their distance) for a way between them. */
const MARGIN_M = 400;
/** Ways about as near a tap as the nearest one: this share of the snap reach farther still counts. */
const SLACK = 0.4;
/** A way this many times the straight distance, and this much longer, goes too far round. */
const DETOUR = 2.5;
const DETOUR_MIN_M = 500;
/** A route's stop joins a way this far off… */
const STOP_SNAP_M = 250;
/** …and, no way that near, one this far: the last bit goes straight. */
const FAR_STOP_M = 1000;
/** A point between joins a way only right where it is. */
const VIA_SNAP_M = 10;
/** The bits off the ways may add up to this share of the straight distance. */
const OFF_WAY_SHARE = 0.5;
/** A straight leg shorter than this is just the last bit to a point, not a gap in the ways. */
const GAP_M = 50;
/** Never farther than this, however far out the map is zoomed. */
const MAX_TAP_SNAP_M = 250;
/** A leg shorter than this on screen has no handle. */
const HANDLE_MIN_PX = 40;

export type LegEnd = 'stop' | 'via';
/** Point `i` of a route's `count`: its start, goal and end are stops, the rest points between. */
export const legEnd = (i: number, count: number, goal?: number): LegEnd =>
  i > 0 && i < count - 1 && i !== goal ? 'via' : 'stop';

/** Why a leg is straight though a network is followed: no ways to load (offline, never cached). */
export type NetworkIssue = 'unavailable' | null;

/** A leg that found no way: straight, and longer than the last bit to a point. */
export const isGap = (leg: readonly LngLat[]) =>
  leg.length === 2 && haversineMeters(leg[0]!, leg[1]!) > GAP_M;

export const metersPerPixel = (lat: number, zoom: number) =>
  (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/** A tap snaps to a way this many screen points away: a finger covers a trail. */
export const tapSnapM = (lat: number, zoom: number) =>
  Math.min(MAX_TAP_SNAP_M, 32 * metersPerPixel(lat, zoom));

/** Where a leg's handle sits, to pull a new point out of it: halfway, or none on a short leg. */
export function legHandle(leg: readonly LngLat[], zoom: number): LngLat | null {
  const mid = pointAlong(leg, 0.5);
  return lineLength(leg) / metersPerPixel(mid[1], zoom) >= HANDLE_MIN_PX ? mid : null;
}

const skiManifest = z.object({ tiles: z.array(z.string()).min(1) });
let skiTemplate: Promise<string | null> | null = null;

/** The ski-route tiles' URL template, from the dataset's manifest (once per launch). */
export function skiTilesTemplate(): Promise<string | null> {
  skiTemplate ??= fetch(SKI_ROUTES_TILEJSON)
    .then(async (res) => skiManifest.parse(await res.json()).tiles[0]!)
    .catch(() => {
      skiTemplate = null;
      return null;
    });
  return skiTemplate;
}

export type LegRouter = {
  /** The last load's problem, read after a call. */
  issue: () => NetworkIssue;
  resolve: (
    from: LngLat | null,
    to: LngLat,
    radiusM: number,
    fromM?: number,
  ) => Promise<{ to: LngLat; line: LngLat[] | null; off: number | null }>;
  between: (from: LngLat, to: LngLat, ends?: readonly [LegEnd, LegEnd]) => Promise<LngLat[]>;
};

/** Legs straight between their points: a line drawn across untracked terrain, as the user sets it. */
export const straightRouter: LegRouter = {
  issue: () => null,
  resolve: async (from, to) => ({ to, line: from && [from, to], off: null }),
  between: async (from, to) => [from, to],
};

export function createLegRouter({
  network,
  maxTiles,
}: {
  /** What the line follows first, then the base map's ways; null = those ways alone. */
  network: () => SnapNetwork | null;
  maxTiles?: number;
}): LegRouter {
  let issue: NetworkIssue = null;
  let built: { key: string; net: Network } | null = null;

  async function networkAround(net: SnapNetwork | null, a: LngLat, b: LngLat) {
    const lat = (a[1] + b[1]) / 2;
    const margin = MARGIN_M + haversineMeters(a, b) / 2;
    const dLat = margin / 111_320;
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);
    const bbox: [number, number, number, number] = [
      Math.min(a[0], b[0]) - dLng,
      Math.min(a[1], b[1]) - dLat,
      Math.max(a[0], b[0]) + dLng,
      Math.max(a[1], b[1]) + dLat,
    ];
    const mpu = metersPerUnit(lat);
    try {
      const { key, lines } = await loadNetworkLines(
        net,
        bbox,
        net === 'ski' ? await skiTilesTemplate() : null,
        maxTiles,
      );
      if (built?.key !== key)
        built = { key, net: buildNetwork(lines, JOIN_M / mpu, BRIDGE_M / mpu) };
      issue = null;
      return { net: built.net, mpu };
    } catch (error) {
      issue = error instanceof TooFarError ? null : 'unavailable';
      return null;
    }
  }

  const resolve: LegRouter['resolve'] = async (from, to, radiusM, fromM = radiusM) => {
    const straight = { to, line: from && [from, to], off: null };
    const found = await networkAround(network(), from ?? to, to);
    if (!found) return straight;
    const { net, mpu } = found;
    const radius = radiusM / mpu;
    const nearest = snapTo(net, toUnits(to), radius);
    const start = from && snapTo(net, toUnits(from), fromM / mpu);
    const line =
      start && routeToTap(net, start, toUnits(to), radius, radius * SLACK)?.points.map(toLngLat);
    const direct = from ? haversineMeters(from, to) : 0;
    if (!line || lineLength(line) > Math.max(DETOUR * direct, direct + DETOUR_MIN_M)) {
      const landed = nearest ? toLngLat(nearest.point) : to;
      return { to: landed, line: from && [from, landed], off: null };
    }
    // The leg starts on its point exactly, even one set off the ways.
    const landed = line.at(-1)!;
    const off = haversineMeters(from!, line[0]!);
    if (off > 1) line.unshift(from!);
    else line[0] = from!;
    return { to: landed, line, off };
  };

  const between: LegRouter['between'] = async (from, to, ends = ['stop', 'stop']) => {
    const reach = (end: LegEnd, far: boolean) =>
      end === 'via' ? VIA_SNAP_M : far ? FAR_STOP_M : STOP_SNAP_M;
    let found = await resolve(from, to, reach(ends[1], false), reach(ends[0], false));
    if (found.off == null && ends.includes('stop')) {
      found = await resolve(from, to, reach(ends[1], true), reach(ends[0], true));
    }
    const { line, off } = found;
    if (
      !line ||
      off == null ||
      off + haversineMeters(found.to, to) > OFF_WAY_SHARE * haversineMeters(from, to)
    ) {
      return [from, to];
    }
    if (haversineMeters(line.at(-1)!, to) > 1) line.push(to);
    else line[line.length - 1] = to;
    return line;
  };

  return { issue: () => issue, resolve, between };
}
