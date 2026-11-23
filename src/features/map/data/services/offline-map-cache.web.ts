// Ported from the PWA's features/map/data/services/offline-map-cache.ts (port-pwa-web): MapLibre GL JS on the web.
/**
 * Shared constants + the canonical-key rule for the offline base map.
 *
 * The download pipeline (writer, main thread) and the service worker (reader)
 * MUST agree on the Cache API name and on how a tile URL is keyed — this module
 * is the single source of truth for both.
 */

/** Cache API cache holding downloaded tiles + style/sprite/glyph assets. */
export const OFFLINE_MAP_CACHE = 'offline-map-tiles';

/** The base-map style whose assets we download so labels render offline. */
export const BASE_STYLE_URL =
  'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json';

/**
 * Tiles are sharded across `vectortiles0..4.geo.admin.ch` and MapLibre
 * round-robins them, but the Cache API keys strictly by full URL (host included)
 * and `cache.match` cannot ignore the host. So we key everything on the bare
 * host — `vectortiles.geo.admin.ch`, which serves the same bytes — applying this
 * on write (download `cache.put`) AND read (SW `cache.match`). One logical tile,
 * one key, regardless of which shard was requested. Path still separates
 * `base.vt` from `relief.vt`, so only the host digit is stripped.
 */
export function normalizeTileUrl(url: string): string {
  return (
    url
      .replace(/(https:\/\/vectortiles)\d(\.geo\.admin\.ch)/, '$1$2')
      // Self-hosted ski-route tiles: drop the dataset version, so a region downloaded
      // before a yearly refresh still answers the new version's URLs (z/x/y are stable).
      .replace(/(\/ski-routes\/)[^/]+\/(\d+\/\d+\/\d+\.pbf)$/, '$1$2')
  );
}
