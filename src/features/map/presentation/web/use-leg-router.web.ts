// Ported from the PWA's features/map/presentation/composables/use-leg-router.ts (port-pwa-web): MapLibre GL JS on the web.
import type { Map as MapLibreMap, VectorTileSource } from 'maplibre-gl';
import type { LngLat } from '@/features/map/domain/entities/trail';
import type { SnapNetwork } from '@/features/map/domain/snap-network';
import type { Network } from '@/features/map/domain/track-routing';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { haversineMeters } from '@/core/utils/haversine';
import { loadNetworkLines, TooFarError } from '@/features/map/data/services/trail-network-service';
import { SKI_ROUTES_TILEJSON } from '@/features/map/data/trail-overlays';
import { lineLength, pointAlong } from '@/features/map/domain/drawn-track';
import {
  buildNetwork,
  metersPerUnit,
  routeToTap,
  snapTo,
  toLngLat,
  toUnits,
} from '@/features/map/domain/track-routing';
import { SKI_ROUTES_SOURCE_ID } from './trail-layers.web';

/** How far apart two ways may lie and still meet: tile-cut trails touch (ski routes reach farther, their own). */
const JOIN_M = 3;
/** How far a way's loose end reaches across to another: the base tiles stop streets short of the trail. */
const BRIDGE_M = 30;
/** A leg looks this far around its two points (plus half their distance) for a way between them. */
const MARGIN_M = 400;
/** Ways about as near a tap as the nearest one: this share of the snap reach farther still counts. */
const SLACK = 0.4;
/**
 * A way this many times the straight distance, and this much longer, goes too far round (a dead
 * end, the next junction kilometres off): the leg goes straight, as off the ways. The floor keeps
 * a few switchbacks on their path.
 */
const DETOUR = 2.5;
const DETOUR_MIN_M = 500;
/** A route's stop (a hut, a summit, a bus stop) joins a way this far off… */
const STOP_SNAP_M = 250;
/** …and, no way that near (a summit above the trail's end), one this far: the last bit goes straight. */
const FAR_STOP_M = 1000;
/**
 * A point between landed on its way when it was set (or stands off the ways on purpose): it joins
 * a way only right where it is, else its legs go straight to it, as to a tap off the ways.
 */
const VIA_SNAP_M = 10;
/** The bits off the ways (to the first way, from the last) may add up to this share of the straight distance; more, and the leg goes straight. */
const OFF_WAY_SHARE = 0.5;

/** A leg's end: a stop is a place, it reaches out to the ways; a point between only says which way. */
export type LegEnd = 'stop' | 'via';
/** What point `i` of a route's `count` is: its start, goal (`goal`) and end are stops, the rest points between. */
export const legEnd = (i: number, count: number, goal?: number): LegEnd =>
  i > 0 && i < count - 1 && i !== goal ? 'via' : 'stop';

/**
 * Why the last leg is straight though a network is followed, where the map doesn't show it: no
 * ways to load (offline, never cached). A tap off the ways or a far jump draws straight: `isGap`.
 */
export type NetworkIssue = 'unavailable' | null;

/** A straight leg shorter than this is just the last bit to a point, not a gap in the ways. */
const GAP_M = 50;
/** A leg that found no way: straight, and longer than the last bit to a point — the line says so. */
export const isGap = (leg: readonly LngLat[]) =>
  leg.length === 2 && haversineMeters(leg[0]!, leg[1]!) > GAP_M;

export const metersPerPixel = (lat: number, zoom: number) =>
  (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/** Never farther than this, however far out the map is zoomed: a point lands near where it was set. */
const MAX_TAP_SNAP_M = 250;
/** A tap (or a point let go) snaps to a way this many screen pixels away: generous, a finger covers a trail. */
export const tapSnapM = (lat: number, zoom: number, coarse: boolean) =>
  Math.min(MAX_TAP_SNAP_M, (coarse ? 32 : 16) * metersPerPixel(lat, zoom));

/** A leg shorter than this on screen has no handle: it would hide its own points. */
const HANDLE_MIN_PX = 40;
/** Where a leg's handle sits, to pull a new point out of it: halfway along, or none on a leg too short. */
export function legHandle(leg: readonly LngLat[], zoom: number): LngLat | null {
  const mid = pointAlong(leg, 0.5);
  return lineLength(leg) / metersPerPixel(mid[1], zoom) >= HANDLE_MIN_PX ? mid : null;
}

interface Options {
  /** What the line follows first, then the base map's ways; null = those ways alone. */
  network: () => SnapNetwork | null;
  /** URL template of the current ski-route tiles. */
  skiTemplate: () => Promise<string | null>;
  /** Tiles a leg may span before it goes straight (the route step's legs run farther than taps). */
  maxTiles?: number;
}

/**
 * Legs along the ways (track-drawing, map-first-tour-creation D8): A* over the ways in the tiles
 * around a leg's two points, the way the drawing joins its taps and the route step its points.
 */
function createLegRouter(
  { network, skiTemplate, maxTiles }: Options,
  setIssue: (issue: NetworkIssue) => void,
) {
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
        net === 'ski' ? await skiTemplate() : null,
        maxTiles,
      );
      if (built?.key !== key)
        built = { key, net: buildNetwork(lines, JOIN_M / mpu, BRIDGE_M / mpu) };
      setIssue(null);
      return { net: built.net, mpu };
    } catch (err) {
      setIssue(err instanceof TooFarError ? null : 'unavailable');
      return null;
    }
  }

  /**
   * Where a point lands (on the nearest way within `radiusM`) and the leg to it from `from` (which
   * joins a way within `fromM`), with how far `from` lies off that way: null when the leg follows
   * no way and goes straight.
   */
  async function resolve(
    from: LngLat | null,
    to: LngLat,
    radiusM: number,
    fromM = radiusM,
  ): Promise<{ to: LngLat; line: LngLat[] | null; off: number | null }> {
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
  }

  /**
   * The leg between two set points, both kept exactly where they are (a hut, a summit): along the
   * ways between them, joined to each by its last straight bit; straight where no way leads. Each
   * end reaches for a way as far as it is (`ends`): a stop off the ways reaches farther before its
   * leg gives up, a point between not at all. Off the ways for more than `OFF_WAY_SHARE` of the
   * straight distance, the ways don't lead there: straight, no bend at a way on the side.
   */
  async function between(
    from: LngLat,
    to: LngLat,
    ends: readonly [LegEnd, LegEnd] = ['stop', 'stop'],
  ): Promise<LngLat[]> {
    const reach = (end: LegEnd, far: boolean) =>
      end === 'via' ? VIA_SNAP_M : far ? FAR_STOP_M : STOP_SNAP_M;
    let found = await resolve(from, to, reach(ends[1], false), reach(ends[0], false));
    if (found.off == null && ends.includes('stop'))
      found = await resolve(from, to, reach(ends[1], true), reach(ends[0], true));
    const { line, off } = found;
    if (
      !line ||
      off == null ||
      off + haversineMeters(found.to, to) > OFF_WAY_SHARE * haversineMeters(from, to)
    )
      return [from, to];
    if (haversineMeters(line.at(-1)!, to) > 1) line.push(to);
    else line[line.length - 1] = to;
    return line;
  }

  return { resolve, between };
}

/** The legs' router for a component: one per mount, its `issue` re-rendering it. */
export function useLegRouter(options: Options) {
  const [issue, setIssue] = useState<NetworkIssue>(null);
  const latest = useRef(options);
  latest.current = options;
  const [router] = useState(() =>
    createLegRouter(
      {
        network: () => latest.current.network(),
        skiTemplate: () => latest.current.skiTemplate(),
        maxTiles: options.maxTiles,
      },
      setIssue,
    ),
  );
  return { issue, ...router };
}

const skiManifest = z.object({ tiles: z.array(z.string()).min(1) });

/** The ski-route tiles' URL template: the map's own source, else the dataset's manifest. */
export async function skiTilesTemplate(map: MapLibreMap | null): Promise<string | null> {
  const fromMap = map?.getSource<VectorTileSource>(SKI_ROUTES_SOURCE_ID)?.tiles?.[0];
  if (fromMap) return fromMap;
  try {
    return skiManifest.parse(await (await fetch(SKI_ROUTES_TILEJSON)).json()).tiles[0]!;
  } catch {
    return null;
  }
}
