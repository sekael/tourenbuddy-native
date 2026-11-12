import { createLogger } from '@/core/logging/logger';
import { wgs84ToLv95 } from '@/core/utils/wgs84-to-lv95';

const logger = createLogger('SwisstopoName');
const TIMEOUT_MS = 10_000;

/**
 * Objektart priority for swissNAMES3D features.
 * Lower number = higher priority. Features not listed default to 99.
 */
const OBJEKTART_PRIORITY: Record<string, number> = {
  'Alpiner Gipfel': 0,
  Hauptgipfel: 0,
  Gipfel: 1,
  Pass: 2,
  Gletscher: 3,
  Gebäude: 4,
  Gebaeude: 4,
  Gebiet: 5,
  Tal: 6,
  Gondelbahn: 7,
  'Flurname swisstopo': 8,
};

/** Names of a whole valley or region: true at the pin, but the same for every point in it. */
const BROAD_AREAS = new Set(['Tal', 'Gebiet']);
/** How far a named spot may lie to name a pin inside a broad area instead. */
const SPOT_RADIUS_M = 300;
/** A summit names a pin only this close: a point on its flank 400 m off isn't that peak. */
const PEAKS = new Set(['Alpiner Gipfel', 'Hauptgipfel', 'Gipfel']);
const PEAK_RADIUS_M = 150;

function getObjektartPriority(objektart: string | undefined): number {
  if (!objektart) return 99;
  return OBJEKTART_PRIORITY[objektart] ?? 99;
}

interface IdentifyFeature {
  layerBodId?: string;
  /** Esri JSON, only with `returnGeometry`: a point (`x`/`y`), a multipoint (`points`) or an area. */
  geometry?: { x?: number; y?: number; points?: number[][] };
  attributes?: {
    name?: string;
    label?: string;
    objektart?: string;
  };
}

interface IdentifyResult {
  results?: IdentifyFeature[];
}

/**
 * Calls the GeoAdmin identify API for a given radius (meters) around the
 * LV95 point. Returns the raw result array (may be empty).
 *
 * Formula: mapExtent=±radiusM, imageDisplay=1000×1000 → 1 px = radiusM/500 m,
 * tolerance=500 px → exactly radiusM meters search radius.
 */
async function identifyAt(
  easting: number,
  northing: number,
  radiusM: number,
  signal: AbortSignal,
  withGeometry = false,
): Promise<IdentifyFeature[]> {
  const params = new URLSearchParams({
    geometry: `${easting},${northing}`,
    geometryType: 'esriGeometryPoint',
    imageDisplay: '1000,1000,96',
    mapExtent: `${easting - radiusM},${northing - radiusM},${easting + radiusM},${northing + radiusM}`,
    tolerance: '500',
    layers: 'all:ch.swisstopo.swissnames3d',
    sr: '2056',
    returnGeometry: String(withGeometry),
    lang: 'de',
  });

  const url = `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?${params}`;
  logger.debug('Swisstopo identify request', { url, radiusM, easting, northing });

  const response = await fetch(url, { signal });

  if (!response.ok) {
    logger.warn('Swisstopo identify API returned non-OK status', response.status);
    return [];
  }

  const data = (await response.json()) as IdentifyResult;
  logger.debug('Swisstopo identify response', {
    radiusM,
    count: data.results?.length ?? 0,
    results: data.results,
  });

  return data.results ?? [];
}

/** Metres from the pin to a named point feature; null for an area or line (no single spot). */
function spotDistance(f: IdentifyFeature, easting: number, northing: number): number | null {
  const g = f.geometry;
  const at = g?.x != null && g.y != null ? [g.x, g.y] : g?.points?.[0];
  return at ? Math.hypot(at[0]! - easting, at[1]! - northing) : null;
}

/**
 * Suggests a tour name by reverse-geocoding the given WGS84 coordinates
 * via the Swisstopo GeoAdmin identify API (swissNAMES3D layer).
 *
 * Strategy:
 * 1. Search within 50 m — finds features at or very near the pin.
 * 2. If empty, fall back to 500 m — where a summit counts only within 150 m (`PEAK_RADIUS_M`).
 * 3. Sort results by Objektart priority and return the name of the best match — unless that is
 *    a whole valley or region (`BROAD_AREAS`): then the nearest named spot within 300 m, so a
 *    start in the valley and a goal on its slope don't both carry the valley's name.
 *
 * Returns null if nothing is found, the API is unavailable, or `signal` aborts.
 */
export async function suggestTourName(
  coords: { lng: number; lat: number },
  signal?: AbortSignal,
): Promise<string | null> {
  const { easting, northing } = wgs84ToLv95(coords.lng, coords.lat);

  // ponytail: manual link instead of AbortSignal.any (iOS < 17.4 lacks it).
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  const timeoutId = setTimeout(abort, TIMEOUT_MS);

  try {
    let results = await identifyAt(easting, northing, 50, controller.signal);

    if (results.length === 0) {
      logger.debug('Swisstopo identify: no results at 50 m, retrying at 500 m');
      results = (await identifyAt(easting, northing, 500, controller.signal, true)).filter(
        (f) =>
          !PEAKS.has(f.attributes?.objektart ?? '') ||
          (spotDistance(f, easting, northing) ?? 0) <= PEAK_RADIUS_M,
      );
    }

    if (results.length === 0) {
      logger.debug('Swisstopo identify: no results found', { coords });
      return null;
    }

    // Sort by Objektart priority, pick the best-matching feature
    const sorted = [...results].sort(
      (a, b) =>
        getObjektartPriority(a.attributes?.objektart) -
        getObjektartPriority(b.attributes?.objektart),
    );

    let best = sorted[0]!;
    if (BROAD_AREAS.has(best.attributes?.objektart ?? '')) {
      const spots = (await identifyAt(easting, northing, SPOT_RADIUS_M, controller.signal, true))
        .map((f) => ({ f, d: spotDistance(f, easting, northing) }))
        .filter(
          ({ f, d }) =>
            d !== null &&
            d <= SPOT_RADIUS_M &&
            f.attributes?.name?.trim() &&
            !BROAD_AREAS.has(f.attributes.objektart ?? ''),
        )
        .sort((a, b) => a.d! - b.d!);
      best = spots[0]?.f ?? best;
    }
    logger.debug('Swisstopo identify: best match', {
      name: best.attributes?.name,
      objektart: best.attributes?.objektart,
    });

    if (!best.attributes) return null;

    // Prefer plain `name` field; fall back to `label` with HTML stripped
    const name = best.attributes.name?.trim();
    if (name) return name;

    const label = best.attributes.label?.replace(/<[^>]*>/g, '').trim();
    return label || null;
  } catch (err) {
    // The caller stopped waiting (field typed into, point re-picked): nothing to report.
    if (signal?.aborted) return null;
    if (err instanceof DOMException && err.name === 'AbortError') {
      logger.warn('Swisstopo identify API timed out');
    } else {
      logger.error('Swisstopo identify API error', err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abort);
  }
}
