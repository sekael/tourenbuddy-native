// Ported from the PWA's features/map/presentation/composables/use-trail-lookup.ts (port-pwa-web): MapLibre GL JS on the web.
import type { Map as MapLibreMap, Point, VectorTileSource } from 'maplibre-gl';
import type { LngLat, Trail } from '@/features/map/domain/entities/trail';
import { useRef, useState } from 'react';
import { z } from 'zod';
import { createLogger } from '@/core/logging/logger';
import {
  fetchSkiRoute,
  SkiRouteNotFoundError,
} from '@/features/map/data/services/swisstopo-trail-service';
import { SKI_ROUTES_TILEJSON } from '@/features/map/data/trail-overlays';
import { nearestOnPolylines } from '@/features/map/domain/nearest-point';
import { CLICKABLE_HALO_LAYER_ID, SKI_ROUTES_SOURCE_ID } from './trail-layers.web';

export const MAX_TRAIL_CANDIDATES = 8;
/** A version switch needs one manifest reload; more often would only hammer a broken host. */
const MANIFEST_REFRESH_MS = 10 * 60_000;

export interface TrailHits {
  /** Nearest first, at most `MAX_TRAIL_CANDIDATES`; empty = miss. */
  candidates: Trail[];
  more: number;
}

export interface TrailHitIds {
  /** Route ids (`sacid`) nearest first, at most `MAX_TRAIL_CANDIDATES`; empty = miss. */
  ids: string[];
  more: number;
}

const manifestSchema = z.object({ tiles: z.array(z.string()).min(1) });

/** Fingertip vs mouse pointer: how far from a route a tap still counts. */
function tapTolerance(): number {
  return window.matchMedia?.('(pointer: coarse)').matches ? 24 : 10;
}

/** Route files sit next to the tiles of the same version (docs/ski-route-hosting.md). */
export function routeFileUrl(tileTemplate: string, id: string): string {
  return tileTemplate.replace(/\{z\}\/\{x\}\/\{y\}\.pbf$/, `routes/${encodeURIComponent(id)}.json`);
}

/**
 * Taps on the marked ski routes. Routes are marked straight from the self-hosted vector
 * tiles, so a tap first hit-tests what is rendered (`hitTest`, no network: tile pieces →
 * one entry per route → nearest first), then loads the hit routes' full geometry.
 * A newer tap supersedes a pending one. A route file 404 means the dataset moved on (or the
 * route was removed): reload the manifest once and retry; still 404 → silently no route.
 */
type LookupOptions = { map: () => MapLibreMap | null; locale: () => string; onError: () => void };

function createTrailLookup(options: LookupOptions) {
  const logger = createLogger('TrailLookup');
  let controller: AbortController | null = null;
  let template: string | null = null;
  let lastRefresh = 0;
  let refreshing: Promise<string> | null = null;

  function currentTemplate(): string | null {
    return (
      template ??
      options.map()?.getSource<VectorTileSource>(SKI_ROUTES_SOURCE_ID)?.tiles?.[0] ??
      null
    );
  }

  /** Reload the manifest (map source included); throttled, concurrent callers share one fetch. */
  function refreshManifest(): Promise<string | null> {
    if (refreshing) return refreshing;
    if (Date.now() - lastRefresh < MANIFEST_REFRESH_MS) return Promise.resolve(currentTemplate());
    lastRefresh = Date.now();
    refreshing = fetch(SKI_ROUTES_TILEJSON)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Ski-route manifest HTTP ${response.status}`);
        const tiles = manifestSchema.parse(await response.json()).tiles[0]!;
        template = tiles;
        options
          .map()
          ?.getSource<VectorTileSource>(SKI_ROUTES_SOURCE_ID)
          ?.setUrl(SKI_ROUTES_TILEJSON);
        return tiles;
      })
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  }

  /** Marked routes within tap tolerance, nearest first. Synchronous; works offline. */
  function hitTest(point: Point): TrailHitIds {
    const map = options.map();
    if (!map?.getLayer(CLICKABLE_HALO_LAYER_ID)) return { ids: [], more: 0 };
    const tolerance = tapTolerance();
    const tap = [point.x, point.y] as const;
    const pieces = map.queryRenderedFeatures(
      [
        [point.x - tolerance, point.y - tolerance],
        [point.x + tolerance, point.y + tolerance],
      ],
      { layers: [CLICKABLE_HALO_LAYER_ID] },
    );
    // A route crossing tile edges comes back once per tile; the piece nearest the tap counts.
    const nearest = new Map<string, number>();
    for (const piece of pieces) {
      const { geometry } = piece;
      const lines =
        geometry.type === 'LineString'
          ? [geometry.coordinates]
          : geometry.type === 'MultiLineString'
            ? geometry.coordinates
            : [];
      const projected = lines.map((line) =>
        line.map((c) => {
          const { x, y } = map.project(c as LngLat);
          return [x, y] as const;
        }),
      );
      const distance = nearestOnPolylines(tap, projected)?.distance ?? Infinity;
      const id = String(piece.properties.id);
      if (distance <= tolerance && distance < (nearest.get(id) ?? Infinity))
        nearest.set(id, distance);
    }
    const ranked = [...nearest].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    return {
      ids: ranked.slice(0, MAX_TRAIL_CANDIDATES),
      more: Math.max(0, ranked.length - MAX_TRAIL_CANDIDATES),
    };
  }

  /** null = this route no longer exists in the published dataset. */
  async function loadRoute(id: string, signal: AbortSignal): Promise<Trail | null> {
    const load = (tiles: string) =>
      fetchSkiRoute({ url: routeFileUrl(tiles, id), locale: options.locale(), signal });
    const tiles = currentTemplate();
    if (!tiles) throw new Error('Ski-route source not loaded');
    try {
      return await load(tiles);
    } catch (err) {
      if (!(err instanceof SkiRouteNotFoundError)) throw err;
    }
    const fresh = await refreshManifest();
    if (!fresh || fresh === tiles) return null;
    try {
      return await load(fresh);
    } catch (err) {
      if (err instanceof SkiRouteNotFoundError) return null;
      throw err;
    }
  }

  /**
   * The routes under a tap with their full geometry. Resolves `null` when the load failed
   * (`onError` called) or a newer tap superseded it; a miss is an empty candidate list.
   */
  async function lookup(point: Point): Promise<TrailHits | null> {
    controller?.abort();
    const own = new AbortController();
    controller = own;
    const { ids, more } = hitTest(point);
    if (ids.length === 0) return { candidates: [], more: 0 };
    try {
      const trails = await Promise.all(ids.map((id) => loadRoute(id, own.signal)));
      if (controller !== own) return null;
      return { candidates: trails.filter((t) => t !== null), more };
    } catch (err) {
      if (controller !== own) return null;
      logger.warn('Loading ski routes failed', err);
      options.onError();
      return null;
    }
  }

  /**
   * Map `error` handler: a ski tile that failed without an HTTP status (network/CORS, e.g. a
   * blocked old-version redirect) reloads the manifest. A 404 is the normal empty tile.
   */
  function onMapError(event: { sourceId?: string; error?: { status?: number } }) {
    if (event.sourceId === SKI_ROUTES_SOURCE_ID && !event.error?.status)
      void refreshManifest().catch((err) =>
        logger.warn('Reloading the ski-route manifest failed', err),
      );
  }

  return { hitTest, lookup, onMapError };
}

/** The ski-route lookup for a component: one per mount, reading the latest options. */
export function useTrailLookup(options: LookupOptions) {
  const latest = useRef(options);
  latest.current = options;
  return useState(() =>
    createTrailLookup({
      map: () => latest.current.map(),
      locale: () => latest.current.locale(),
      onError: () => latest.current.onError(),
    }),
  )[0];
}
