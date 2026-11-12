import type { SnapNetwork } from '@/features/map/domain/snap-network';
import type { NetworkLine, Pt } from '@/features/map/domain/track-routing';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { metersPerUnit } from '@/features/map/domain/track-routing';

/**
 * The way network a drawn track snaps to, read from vector tiles at zoom 13: the roads, forest
 * roads and paths of swisstopo's base map tiles (`transportation`; the official hiking trails carry
 * `sac_scale`) under every mode, the ski routes from the self-hosted ski-route tiles on top in ski
 * mode. Both are what the map already shows, so the service worker's tile caches (and downloaded
 * offline regions) serve them too.
 */
export const NETWORK_ZOOM = 13;
const BASE_TILES =
  'https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0/{z}/{x}/{y}.pbf';
/** A leg spanning more tiles than this is drawn straight (a far tap, not a trail to follow). */
const MAX_TILES = 30;
const MAX_CACHED_TILES = 120;

/** Ways a hike may use besides marked trails: paths, tracks, small roads — never highways or rails. */
const WALKABLE = new Set([
  'path',
  'footway',
  'track',
  'trail',
  'minor',
  'service',
  'tertiary',
  'secondary',
  'mask_terrain',
]);
/** Ways the shown layer doesn't mark cost more, so a route keeps to it and leaves it only to reach a point. */
const OFF_TRAIL_COST = 1.5;
/** Ski routes run side by side up a shared approach and end short of the road: they meet this far. */
const SKI_JOIN_M = 20;

export class TooFarError extends Error {}
export class NetworkUnavailableError extends Error {}

/** A tile's ways, `marked` = an official hiking trail (base) or a ski route. */
interface TileLine {
  points: Pt[];
  marked: boolean;
}

const tiles = new Map<string, Promise<TileLine[]>>();

function lonToTile(lng: number) {
  return Math.floor(((lng + 180) / 360) * 2 ** NETWORK_ZOOM);
}

function latToTile(lat: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** NETWORK_ZOOM);
}

function linesOf(buffer: ArrayBuffer, ski: boolean, tx: number, ty: number): TileLine[] {
  const layer = new VectorTile(new Pbf(buffer)).layers[ski ? 'routes' : 'transportation'];
  if (!layer) return [];
  const lines: TileLine[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    if (feature.type !== 2) continue;
    const { class: kind, sac_scale: trail } = feature.properties;
    if (!ski && !trail && !WALKABLE.has(String(kind))) continue;
    // Tile units → network units (zoom-13 global pixels at 4096 per tile).
    const scale = 4096 / layer.extent;
    for (const part of feature.loadGeometry()) {
      const points: Pt[] = part.map((p) => [tx * 4096 + p.x * scale, ty * 4096 + p.y * scale]);
      if (points.length > 1) lines.push({ points, marked: ski || !!trail });
    }
  }
  return lines;
}

function loadTile(url: string, ski: boolean, tx: number, ty: number): Promise<TileLine[]> {
  const cached = tiles.get(url);
  if (cached) return cached;
  const pending = fetch(url).then(async (response) => {
    // A missing tile is an empty one (no routes there).
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Tile HTTP ${response.status}`);
    return linesOf(await response.arrayBuffer(), ski, tx, ty);
  });
  // A failed tile is retried by the next leg, not remembered.
  pending.catch(() => tiles.delete(url));
  tiles.set(url, pending);
  if (tiles.size > MAX_CACHED_TILES) tiles.delete(tiles.keys().next().value!);
  return pending;
}

/**
 * The network's ways in `bbox` ([west, south, east, north]), with a key naming the tile set (equal
 * keys → equal lines), over at most `maxTiles` tiles. What the shown layer marks costs 1 — the hiking trails, the ski routes —
 * every other way `OFF_TRAIL_COST`; with no layer (`null`) every way costs 1. `skiTemplate` is the
 * ski tiles' URL template of the current dataset (none: the ways alone). Rejects with
 * `TooFarError` for a box over too many tiles, `NetworkUnavailableError` when no tile could be had
 * (offline and never cached). Tiles that fail beside loaded ones count as empty.
 */
export async function loadNetworkLines(
  network: SnapNetwork | null,
  bbox: [number, number, number, number],
  skiTemplate: string | null,
  maxTiles = MAX_TILES,
): Promise<{ key: string; lines: NetworkLine[] }> {
  const [west, south, east, north] = bbox;
  const [x0, x1, y0, y1] = [lonToTile(west), lonToTile(east), latToTile(north), latToTile(south)];
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > maxTiles) throw new TooFarError();
  const sets = network === 'ski' && skiTemplate ? [BASE_TILES, skiTemplate] : [BASE_TILES];
  const requests: Promise<TileLine[]>[] = [];
  const ski: boolean[] = [];
  for (const template of sets) {
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        const url = template
          .replace('{z}', String(NETWORK_ZOOM))
          .replace('{x}', String(x))
          .replace('{y}', String(y));
        requests.push(loadTile(url, template !== BASE_TILES, x, y));
        ski.push(template !== BASE_TILES);
      }
    }
  }
  const results = await Promise.allSettled(requests);
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed === results.length) throw new NetworkUnavailableError('No tile loaded');
  const skiJoin = SKI_JOIN_M / metersPerUnit((south + north) / 2);
  const cost = (marked: boolean, fromSki: boolean) => {
    if (!network) return 1;
    return marked && (network === 'ski') === fromSki ? 1 : OFF_TRAIL_COST;
  };
  return {
    key: `${network}/${x0}-${x1}/${y0}-${y1}/${failed}`,
    lines: results.flatMap((r, i) =>
      r.status === 'fulfilled'
        ? r.value.map(({ points, marked }) => ({
            points,
            cost: cost(marked, ski[i]!),
            ...(ski[i] && { join: skiJoin }),
          }))
        : [],
    ),
  };
}
