// Ported from the PWA's features/map/data/services/pick-tile-response.ts (port-pwa-web): MapLibre GL JS on the web.
import { normalizeTileUrl } from './offline-map-cache.web';

/**
 * Offline-first tile decision, extracted as a plain injectable function so it is
 * unit-testable without a service worker. Deps are the two behaviours the SW
 * provides: a lookup in the offline download cache, and the existing runtime SWR
 * handler to fall back to.
 */
export interface PickTileDeps {
  /** Look up a canonical URL in the offline download cache. */
  cacheMatch: (url: string) => Promise<Response | undefined>;
  /** Existing StaleWhileRevalidate handler for a cache miss. */
  swrHandler: () => Promise<Response>;
}

/**
 * Return the downloaded copy if present (no network), else delegate to the
 * runtime SWR handler. A cache read that throws must NOT reject the request —
 * fall back to the network exactly as a miss would.
 */
export async function pickTileResponse(request: Request, deps: PickTileDeps): Promise<Response> {
  try {
    const hit = await deps.cacheMatch(normalizeTileUrl(request.url));
    if (hit) return hit;
  } catch {
    // offline cache unreadable — treat as a miss
  }
  try {
    return await deps.swrHandler();
  } catch {
    // Offline AND not downloaded (e.g. panned outside a downloaded region): return
    // an empty tile so MapLibre renders a blank area instead of rejecting the
    // FetchEvent. A flood of rejections here is what freezes the tab.
    return new Response(new ArrayBuffer(0), {
      status: 200,
      headers: { 'content-type': 'application/x-protobuf' },
    });
  }
}
