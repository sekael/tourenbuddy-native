// Ported from the PWA's features/map/data/services/offline-tile-service.ts (port-pwa-web): MapLibre GL JS on the web.
import type { OfflineRegion } from './offline-region-store.web';
import { createLogger } from '@/core/logging/logger';
import { SKI_ROUTES_TILEJSON } from '@/features/map/data/trail-overlays';
import { BASE_STYLE_URL, normalizeTileUrl, OFFLINE_MAP_CACHE } from './offline-map-cache.web';
import { getAllRegions, putRegion } from './offline-region-store.web';

const logger = createLogger('OfflineTiles');

/**
 * Both vector sources of the base map (spike 2026-07-20): every logical tile is
 * two fetches — the base geometry and the relief hillshade. Bare (canonical)
 * host; see `normalizeTileUrl`.
 */
const TILE_SOURCES = [
  'https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.base.vt/v1.0.0',
  'https://vectortiles.geo.admin.ch/tiles/ch.swisstopo.relief.vt/v1.0.0',
];

/** Font stacks the style declares (spike). ponytail: refresh if Swisstopo changes fonts. */
const FONT_STACKS = [
  'Frutiger Neue Regular',
  'Frutiger Neue Italic',
  'Frutiger Neue Medium',
  'Frutiger Neue Condensed Regular',
  'Frutiger Neue Condensed Medium',
];
/**
 * Glyph ranges covering Latin + accented chars used in Swiss place names, plus General
 * Punctuation (en dash, thin spaces) for the tour labels' date ranges.
 */
const GLYPH_RANGES = ['0-255', '256-511', '512-767', '768-1023', '8192-8447'];

/**
 * Average stored bytes per tile. A flat blend badly under-fits a SINGLE region
 * (a small region is dominated by large low-zoom tiles; the whole-CH blend is
 * dominated by small z14 tiles), so we self-calibrate: after each download we
 * fold the measured average back in (EWMA) and persist it. The default only
 * seeds the very first estimate.
 * ponytail: one learned scalar, not a per-zoom table — converges to the user's
 * real regions with no calibration spike. Upgrade to per-zoom only if estimates
 * across wildly different region sizes must be simultaneously tight.
 */
const AVG_TILE_BYTES_DEFAULT = 120_000;
const AVG_TILE_STORAGE_KEY = 'offline-map:avg-tile-bytes';
/** Bias the estimate high — under-promising storage is worse than over-. */
const ESTIMATE_SAFETY = 1.5;

function loadAvgTileBytes(): number {
  try {
    const v = Number(globalThis.localStorage?.getItem(AVG_TILE_STORAGE_KEY));
    return Number.isFinite(v) && v > 0 ? v : AVG_TILE_BYTES_DEFAULT;
  } catch {
    return AVG_TILE_BYTES_DEFAULT;
  }
}

let avgTileBytes = loadAvgTileBytes();
/**
 * Self-hosted ski-route tiles (docs/ski-route-hosting.md): z11–z13 only, sparse (most
 * coordinates 404 = no route), ≈1–5 KB each. Keyed version-less in the offline cache
 * (`normalizeTileUrl`), downloaded from the current version's template.
 */
const SKI_MIN_ZOOM = 11;
const SKI_MAX_ZOOM = 13;
const SKI_TILE_BYTES = 5_000;
const SKI_TILE_KEY_TEMPLATE = SKI_ROUTES_TILEJSON.replace(/\.json$/, '/{z}/{x}/{y}.pbf');

/** Fixed allowance for style.json + sprites + glyph PBFs. */
const ASSET_ALLOWANCE = 3_000_000;

const CONCURRENCY = 6;
const RETRY_STATUS = new Set([429]);
const QUOTA_CHECK_EVERY = 200;
/** Never fill past this fraction of quota — leaves headroom for app data. */
const QUOTA_SAFETY = 0.9;

/** A region always downloads the full native depth: minzoom 0 → source maxzoom 14 (spike). */
export const REGION_MIN_ZOOM = 0;
export const REGION_MAX_ZOOM = 14;

/** WGS84 [W,S,E,N] extent of Switzerland — the "download whole map" region (spike: ≈3.25 GB). */
export const SWITZERLAND_BBOX: [number, number, number, number] = [5.956, 45.818, 10.492, 47.808];

interface StyleJson {
  sprite?: string | { id: string; url: string }[];
  glyphs?: string;
}

export interface DownloadProgress {
  done: number;
  total: number;
  bytes: number;
}

export class OfflineQuotaError extends Error {
  constructor(needed: number, free: number) {
    super(`Insufficient storage: need ~${needed} bytes, ~${free} free`);
    this.name = 'OfflineQuotaError';
  }
}

/**
 * Contract:
 * - `bbox` is `[west, south, east, north]` in WGS84 degrees.
 * - For each zoom `z` in `[minZoom..maxZoom]`, convert the bbox corners to
 *   slippy tile coordinates (Web-Mercator):
 *     x = floor((lon + 180) / 360 * 2^z)
 *     y = floor((1 - ln(tan(latRad) + 1/cos(latRad)) / π) / 2 * 2^z)   // lat in radians
 *   note y grows southward, so north maps to the smaller y.
 * - Emit `${source}/${z}/${x}/${y}.pbf` for BOTH `TILE_SOURCES` for every
 *   (x, y) in the covered range. URLs are already canonical — do not shard.
 * - Clamp x and y to `[0, 2^z - 1]`.
 * - A zero-area or inverted bbox must yield no garbage: order the corners so
 *   xMin ≤ xMax and yMin ≤ yMax; a point still yields its single covering tile.
 */
export function enumerateTiles(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): string[] {
  const urls: string[] = [];
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const { minX, maxX, minY, maxY } = tileRange(bbox, zoom);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (const src of TILE_SOURCES) urls.push(`${src}/${zoom}/${x}/${y}.pbf`);
      }
    }
  }

  return urls;
}

/**
 * Tile count for a region WITHOUT materializing the URLs. The estimate path
 * runs this on every rectangle drag, so it stays pure arithmetic (O(zoom
 * levels), zero allocation) instead of building and discarding a ~148k-string
 * array just to read `.length`.
 */
export function countTiles(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): number {
  let tiles = 0;
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const { minX, maxX, minY, maxY } = tileRange(bbox, zoom);
    tiles += (maxX - minX + 1) * (maxY - minY + 1) * TILE_SOURCES.length;
  }
  return tiles;
}

/** Style-referenced assets that must be cached so labels/symbols render offline. */
export function enumerateAssetUrls(style: StyleJson): string[] {
  const urls: string[] = [BASE_STYLE_URL];

  const sprites = Array.isArray(style.sprite)
    ? style.sprite
    : style.sprite
      ? [{ id: 'default', url: style.sprite }]
      : [];
  for (const s of sprites) {
    for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) urls.push(`${s.url}${suffix}`);
  }

  if (style.glyphs) {
    for (const stack of FONT_STACKS) {
      for (const range of GLYPH_RANGES) {
        urls.push(
          style.glyphs.replace('{fontstack}', encodeURIComponent(stack)).replace('{range}', range),
        );
      }
    }
  }

  return urls;
}

/**
 * Ski-route tile URLs for a region, from a `{z}/{x}/{y}` template: the version-less
 * key template by default (cache bookkeeping), the manifest's versioned one to download.
 */
export function enumerateSkiTiles(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
  template = SKI_TILE_KEY_TEMPLATE,
): string[] {
  const urls: string[] = [];
  for (
    let zoom = Math.max(minZoom, SKI_MIN_ZOOM);
    zoom <= Math.min(maxZoom, SKI_MAX_ZOOM);
    zoom++
  ) {
    const { minX, maxX, minY, maxY } = tileRange(bbox, zoom);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++)
        urls.push(
          template.replace('{z}', String(zoom)).replace('{x}', String(x)).replace('{y}', String(y)),
        );
    }
  }
  return urls;
}

/** Every tile cache key a region owns: base map + ski routes. */
function regionTileKeys(r: Pick<OfflineRegion, 'bbox' | 'minZoom' | 'maxZoom'>): string[] {
  return [
    ...enumerateTiles(r.bbox, r.minZoom, r.maxZoom),
    ...enumerateSkiTiles(r.bbox, r.minZoom, r.maxZoom),
  ];
}

/** Estimated download size for a region — tile count × avg + fixed asset allowance. */
export function estimateBytes(
  bbox: [number, number, number, number],
  minZoom: number,
  maxZoom: number,
): number {
  let skiTiles = 0;
  for (
    let zoom = Math.max(minZoom, SKI_MIN_ZOOM);
    zoom <= Math.min(maxZoom, SKI_MAX_ZOOM);
    zoom++
  ) {
    const { minX, maxX, minY, maxY } = tileRange(bbox, zoom);
    skiTiles += (maxX - minX + 1) * (maxY - minY + 1);
  }
  return Math.round(
    (countTiles(bbox, minZoom, maxZoom) * avgTileBytes +
      skiTiles * SKI_TILE_BYTES +
      ASSET_ALLOWANCE) *
      ESTIMATE_SAFETY,
  );
}

/**
 * Tiles exclusive to `target` — i.e. not covered by any `survivors`. Pure so the
 * delete/keep decision is unit-testable without a Cache. Assets are shared and
 * tiny, handled separately (kept while any region survives).
 */
export function orphanTileUrls(target: OfflineRegion, survivors: OfflineRegion[]): string[] {
  const keep = new Set(survivors.flatMap(regionTileKeys));
  return regionTileKeys(target).filter((u) => !keep.has(u));
}

function lon2x(lon: number, zoom: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}
function lat2y(lat: number, zoom: number) {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom,
  );
}
function clamp(v: number, max: number) {
  return Math.max(0, Math.min(max, v));
}

/**
 * Inclusive slippy-tile index range covering `bbox` at `zoom`, clamped to the
 * `[0, 2^z-1]` grid. Corners are min/max'd so an inverted or zero-area bbox
 * yields a valid ascending range (a point collapses to a single tile).
 */
function tileRange(bbox: [number, number, number, number], zoom: number) {
  const [west, south, east, north] = bbox;
  const max = 2 ** zoom - 1;
  return {
    minX: clamp(Math.min(lon2x(west, zoom), lon2x(east, zoom)), max),
    maxX: clamp(Math.max(lon2x(west, zoom), lon2x(east, zoom)), max),
    minY: clamp(Math.min(lat2y(south, zoom), lat2y(north, zoom)), max),
    maxY: clamp(Math.max(lat2y(south, zoom), lat2y(north, zoom)), max),
  };
}

async function fetchStyle(signal?: AbortSignal): Promise<StyleJson> {
  const res = await fetch(BASE_STYLE_URL, { signal });
  if (!res.ok) throw new Error(`style fetch failed: ${res.status}`);
  return res.json() as Promise<StyleJson>;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Retry only transient failures (429 / 5xx / network); back off with jitter. */
async function fetchWithRetry(url: string, signal?: AbortSignal, tries = 3): Promise<Response> {
  let delay = 300;
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
    try {
      const res = await fetch(url, { signal });
      // 404/204: no tile at this coord (bbox corner over empty area) — caller skips.
      if (res.ok || res.status === 404 || res.status === 204) return res;
      if (!RETRY_STATUS.has(res.status) && res.status < 500)
        throw new Error(`fetch ${res.status} ${url}`); // non-transient → fail hard
      throw new Error(`transient ${res.status}`);
    } catch (err) {
      if (signal?.aborted || attempt >= tries) throw err;
      await sleep(delay + Math.random() * delay, signal);
      delay *= 2;
    }
  }
}

/** Stores under the canonical key (`normalizeTileUrl`), which the SW looks up. */
async function fetchAndStore(url: string, cache: Cache, signal?: AbortSignal): Promise<number> {
  const res = await fetchWithRetry(url, signal);
  if (res.status === 404 || res.status === 204) return 0;
  const body = await res.arrayBuffer();
  await cache.put(normalizeTileUrl(url), new Response(body, { headers: res.headers }));
  return body.byteLength;
}

/**
 * The region's ski-route tiles from the current dataset version, clipped to the
 * dataset's bounds. A data host that can't be reached skips only the ski routes;
 * the base map download never fails because of them.
 */
async function skiTileUrls(
  region: Pick<OfflineRegion, 'bbox' | 'minZoom' | 'maxZoom'>,
  signal?: AbortSignal,
): Promise<string[]> {
  try {
    const res = await fetch(SKI_ROUTES_TILEJSON, { signal });
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    const { tiles, bounds } = (await res.json()) as {
      tiles: string[];
      bounds?: [number, number, number, number];
    };
    const [w, s, e, n] = region.bbox;
    const clipped: [number, number, number, number] = bounds
      ? [
          Math.max(w, bounds[0]),
          Math.max(s, bounds[1]),
          Math.min(e, bounds[2]),
          Math.min(n, bounds[3]),
        ]
      : region.bbox;
    if (clipped[0] > clipped[2] || clipped[1] > clipped[3]) return [];
    return enumerateSkiTiles(clipped, region.minZoom, region.maxZoom, tiles[0]);
  } catch (err) {
    if (signal?.aborted) throw err;
    logger.warn('Ski-route manifest unavailable — region downloads without ski routes', err);
    return [];
  }
}

async function assertHeadroom(projected: number): Promise<void> {
  const est = await navigator.storage?.estimate?.();
  if (!est || est.quota == null) return;
  const free = est.quota * QUOTA_SAFETY - (est.usage ?? 0);
  if (projected > free) throw new OfflineQuotaError(projected, free);
}

async function runPool<T>(
  items: T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
  signal?: AbortSignal,
): Promise<void> {
  let i = 0;
  async function next(): Promise<void> {
    while (i < items.length) {
      if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
      await worker(items[i++]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => next()));
}

/**
 * Download a region: fetch every tile + style asset into `offline-map-tiles`,
 * bounded concurrency, cancelable. All-or-nothing — a cancel/failure rolls back
 * this run's cache writes and writes NO region record; on success the metadata
 * record is written LAST so a region is atomic from the UI's view.
 */
export async function downloadRegion(
  region: Pick<OfflineRegion, 'id' | 'label' | 'bbox' | 'minZoom' | 'maxZoom'>,
  opts: { onProgress?: (p: DownloadProgress) => void; signal?: AbortSignal } = {},
): Promise<OfflineRegion> {
  const { onProgress, signal } = opts;
  const cache = await caches.open(OFFLINE_MAP_CACHE);
  const style = await fetchStyle(signal);
  const tileUrls = enumerateTiles(region.bbox, region.minZoom, region.maxZoom);
  const assetUrls = enumerateAssetUrls(style);
  const all = [...assetUrls, ...tileUrls, ...(await skiTileUrls(region, signal))];

  await assertHeadroom(estimateBytes(region.bbox, region.minZoom, region.maxZoom));

  const written: string[] = [];
  let done = 0;
  let bytes = 0;
  let tileBytes = 0;
  let tileHits = 0;
  try {
    await runPool(
      all,
      async (url) => {
        const n = await fetchAndStore(url, cache, signal);
        if (n > 0) {
          written.push(normalizeTileUrl(url));
          bytes += n;
          if (url.includes('/tiles/')) {
            tileBytes += n;
            tileHits += 1;
          }
        }
        done += 1;
        if (done % QUOTA_CHECK_EVERY === 0) await assertHeadroom(0);
        onProgress?.({ done, total: all.length, bytes });
      },
      CONCURRENCY,
      signal,
    );
  } catch (err) {
    logger.warn('download failed/canceled — rolling back', err);
    await Promise.all(written.map((u) => cache.delete(u)));
    throw err;
  }

  // Self-calibrate the tile-size estimate from what we actually stored. Track the
  // MAX observed average (never step down), so the estimate keeps erring high for
  // future regions rather than lagging behind a dense one.
  if (tileHits > 0) {
    avgTileBytes = Math.max(avgTileBytes, Math.round(tileBytes / tileHits));
    try {
      globalThis.localStorage?.setItem(AVG_TILE_STORAGE_KEY, String(avgTileBytes));
    } catch {
      /* non-fatal — estimate just won't persist */
    }
  }

  const record: OfflineRegion = {
    ...region,
    // Plain-copy the bbox: callers pass a Vue reactive Proxy, which IndexedDB's
    // structured clone rejects with DataCloneError (silently losing the record).
    bbox: [...region.bbox] as [number, number, number, number],
    tileCount: tileUrls.length,
    bytes,
    createdAt: Date.now(),
  };
  await putRegion(record);
  return record;
}

/**
 * Delete a region's tiles, preserving tiles shared with any surviving region.
 * When the last region is removed, drop the whole cache (assets go too).
 */
export async function deleteRegion(id: string): Promise<void> {
  const regions = await getAllRegions();
  const target = regions.find((r) => r.id === id);
  if (!target) return;
  const survivors = regions.filter((r) => r.id !== id);

  if (survivors.length === 0) {
    await caches.delete(OFFLINE_MAP_CACHE);
  } else {
    const cache = await caches.open(OFFLINE_MAP_CACHE);
    await Promise.all(orphanTileUrls(target, survivors).map((u) => cache.delete(u)));
  }
  const { deleteRegionRecord } = await import('./offline-region-store.web');
  await deleteRegionRecord(id);
}

/**
 * Purge tiles left in the cache by a download that was killed mid-write (all-or-
 * nothing means such tiles have no owning region record). Assets are left alone.
 */
export async function sweepOrphanTiles(): Promise<void> {
  const regions = await getAllRegions();
  const keep = new Set(regions.flatMap(regionTileKeys));
  const cache = await caches.open(OFFLINE_MAP_CACHE);
  const keys = await cache.keys();
  await Promise.all(
    keys.map(async (req) => {
      const url = normalizeTileUrl(req.url);
      if (
        (url.includes('/tiles/ch.swisstopo.') ||
          (url.endsWith('.pbf') && url.includes('/ski-routes/'))) &&
        !keep.has(url)
      )
        await cache.delete(req);
    }),
  );
}
