import { createLogger } from '@/core/logging/logger';
import { wgs84ToLv95 } from '@/core/utils/wgs84-to-lv95';

const logger = createLogger('SwisstopoElevation');
const TIMEOUT_MS = 10_000;

/**
 * Retrieves elevation in meters at the given WGS84 coordinates using the
 * Swisstopo height REST API (EPSG:2056 / LV95).
 *
 * Returns the elevation rounded to the nearest meter, or null if the API is
 * unavailable, times out, the location is outside Swiss territory, or `signal` aborts.
 */
export async function getElevation(
  coords: { lng: number; lat: number },
  signal?: AbortSignal,
): Promise<number | null> {
  const { easting, northing } = wgs84ToLv95(coords.lng, coords.lat);
  const url = `https://api3.geo.admin.ch/rest/services/height?easting=${easting.toFixed(2)}&northing=${northing.toFixed(2)}&sr=2056`;

  // ponytail: manual link instead of AbortSignal.any (iOS < 17.4 lacks it).
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  const timeoutId = setTimeout(abort, TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      logger.warn('Swisstopo elevation API returned non-OK status', response.status);
      return null;
    }

    const data = (await response.json()) as { height?: number | string };

    if (data.height == null || data.height === 'None') {
      return null;
    }

    const height = Number(data.height);
    return Number.isFinite(height) ? Math.round(height) : null;
  } catch (err) {
    // The caller stopped waiting (field typed into, point re-picked): nothing to report.
    if (signal?.aborted) return null;
    if (err instanceof DOMException && err.name === 'AbortError') {
      logger.warn('Swisstopo elevation API timed out');
    } else {
      logger.error('Swisstopo elevation API error', err);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abort);
  }
}
