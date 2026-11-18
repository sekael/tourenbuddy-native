import { z } from 'zod';

import i18n from '@/core/i18n';
import { createLogger } from '@/core/logging/logger';
import {
  fetchSkiRoute,
  SkiRouteNotFoundError,
} from '@/features/map/data/services/swisstopo-trail-service';
import { SKI_ROUTES_TILEJSON } from '@/features/map/data/trail-overlays';
import type { LngLat, Trail } from '@/features/map/domain/entities/trail';
import { nearestOnPolylines } from '@/features/map/domain/nearest-point';

import type { TourMapHandle } from './tour-map';
import { SKI_HALO_LAYER } from './tour-map';

/**
 * Taps on the marked ski routes (trail-lookup), ported from the PWA's `use-trail-lookup`: hit-test
 * what is rendered (no network), nearest first, then load the routes' full geometry from the
 * self-hosted dataset. Native projection is asynchronous, so distances are measured on the ground
 * (metres around the tap) instead of in screen pixels; the query box is the same fingertip.
 */
export const MAX_TRAIL_CANDIDATES = 8;
const MANIFEST_REFRESH_MS = 10 * 60_000;
const log = createLogger('TrailLookup');
const manifestSchema = z.object({ tiles: z.array(z.string()).min(1) });

let template: string | null = null;
let lastRefresh = 0;

/** Route files sit next to the tiles of the same dataset version. */
export function routeFileUrl(tileTemplate: string, id: string): string {
  return tileTemplate.replace(/\{z\}\/\{x\}\/\{y\}\.pbf$/, `routes/${encodeURIComponent(id)}.json`);
}

async function tilesTemplate(force = false): Promise<string> {
  if (template && (!force || Date.now() - lastRefresh < MANIFEST_REFRESH_MS)) return template;
  lastRefresh = Date.now();
  const response = await fetch(SKI_ROUTES_TILEJSON);
  if (!response.ok) throw new Error(`Ski-route manifest HTTP ${response.status}`);
  template = manifestSchema.parse(await response.json()).tiles[0]!;
  return template;
}

/** Metres east/north of `origin`: good enough to rank a few routes around one tap. */
function local([lng, lat]: GeoJSON.Position, origin: LngLat): [number, number] {
  const k = Math.cos((origin[1] * Math.PI) / 180);
  return [(lng! - origin[0]) * 111_320 * k, (lat! - origin[1]) * 110_540];
}

/** Route ids under the tap, nearest first. */
export async function hitTestSkiRoutes(
  map: TourMapHandle,
  point: [number, number],
  lngLat: LngLat,
): Promise<{ ids: string[]; more: number }> {
  const pieces = await map.queryAt(point, [SKI_HALO_LAYER]);
  const nearest = new Map<string, number>();
  for (const piece of pieces) {
    const { geometry } = piece;
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates
          : [];
    const projected = lines.map((line) => line.map((c) => local(c, lngLat)));
    const distance = nearestOnPolylines([0, 0], projected)?.distance ?? Infinity;
    const id = String(piece.properties?.id ?? '');
    if (id && distance < (nearest.get(id) ?? Infinity)) nearest.set(id, distance);
  }
  const ranked = [...nearest].sort((a, b) => a[1] - b[1]).map(([id]) => id);
  return {
    ids: ranked.slice(0, MAX_TRAIL_CANDIDATES),
    more: Math.max(0, ranked.length - MAX_TRAIL_CANDIDATES),
  };
}

/** A route's full details; null when the published dataset no longer has it. */
async function loadRoute(id: string, signal: AbortSignal): Promise<Trail | null> {
  const locale = i18n.language;
  try {
    return await fetchSkiRoute({ url: routeFileUrl(await tilesTemplate(), id), locale, signal });
  } catch (error) {
    if (!(error instanceof SkiRouteNotFoundError)) throw error;
  }
  // The dataset moved on: one manifest reload, then the route is gone for good.
  try {
    return await fetchSkiRoute({
      url: routeFileUrl(await tilesTemplate(true), id),
      locale,
      signal,
    });
  } catch (error) {
    if (error instanceof SkiRouteNotFoundError) return null;
    throw error;
  }
}

let pending: AbortController | null = null;

/** The routes under a tap with their details, or null for none (or a newer tap). */
export async function lookupSkiRoutes(
  map: TourMapHandle,
  point: [number, number],
  lngLat: LngLat,
): Promise<{ candidates: Trail[]; more: number } | null> {
  // A newer tap supersedes a pending one.
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  const { ids, more } = await hitTestSkiRoutes(map, point, lngLat);
  if (ids.length === 0 || controller.signal.aborted) return null;
  try {
    const routes = await Promise.all(ids.map((id) => loadRoute(id, controller.signal)));
    if (controller.signal.aborted) return null;
    const candidates = routes.filter((route): route is Trail => route !== null);
    return candidates.length ? { candidates, more } : null;
  } catch (error) {
    if (!controller.signal.aborted) log.warn('Ski route lookup failed', error);
    return null;
  }
}
