import { type LngLatBounds, OfflineManager, type OfflinePackStatus } from '@maplibre/maplibre-react-native';
import { File, Paths } from 'expo-file-system';

export const REMOTE_BASEMAP = 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json';
export const SKI_ROUTES_TILEJSON = 'https://tourenbuddy-data.pages.dev/ski-routes.json';
export const SWITZERLAND: LngLatBounds = [5.956, 45.818, 10.492, 47.808];

/**
 * `createPack` takes a style URL, never an object, and the base map style has no ski routes. So the
 * pack (and the map, so it still finds its style offline) uses a local copy with the ski source added.
 */
const localStyle = new File(Paths.document, 'offline-basemap.json');

export const basemapStyle = () => (localStyle.exists ? localStyle.uri : REMOTE_BASEMAP);

async function writeMergedStyle(): Promise<string> {
  const style = await (await fetch(REMOTE_BASEMAP)).json();
  style.sources['ski-routes'] = { type: 'vector', url: SKI_ROUTES_TILEJSON };
  localStyle.write(JSON.stringify(style));
  return localStyle.uri;
}

/** Same depth as the PWA's offline regions: z0–14 of every source, glyphs + sprites included. */
export async function downloadPack(
  name: string,
  bounds: LngLatBounds,
  onStatus: (line: string) => void,
): Promise<void> {
  const started = Date.now();
  const mapStyle = await writeMergedStyle();
  // Whole CH ≈ 37k tiles per vector source (z14 alone 27.5k); the default cap is 6,000.
  OfflineManager.setTileCountLimit(200_000);
  await OfflineManager.createPack(
    { mapStyle, bounds, minZoom: 0, maxZoom: 14, metadata: { name } },
    (_pack, s: OfflinePackStatus) => onStatus(
      `${name}: ${s.state} ${s.percentage.toFixed(0)}% · ${s.completedTileCount} tiles · `
      + `${s.completedResourceCount}/${s.requiredResourceCount} res · `
      + `${(s.completedResourceSize / 1e6).toFixed(1)} MB · ${Math.round((Date.now() - started) / 1000)} s`,
    ),
    (_pack, error) => onStatus(`${name}: error ${error.message}`),
  );
}

/** Drops packs and the ambient cache, so the next offline test starts from nothing. */
export const resetOffline = () => OfflineManager.resetDatabase();
