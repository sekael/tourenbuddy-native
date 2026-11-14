/**
 * Offline regions (offline-map D10): a rectangle of the vector base map, zoom 0 to 14, and what
 * it will take on the device. Bounds are west, south, east, north.
 */
export type Bounds = [west: number, south: number, east: number, north: number];

export const OFFLINE_MIN_ZOOM = 0;
export const OFFLINE_MAX_ZOOM = 14;

/**
 * What a pack takes per tile position: the base map's two sources (base and relief) each store a
 * tile there. Sized never to promise too little (owner, 2026-11-14): the largest measured, about
 * 350 kB together uncompressed in the Alps (geo.admin, Lauterbrunnen), plus 5 MB the style brings
 * once (fonts, sprites). Packs saved on the device: 8.7, 12 and 18 MB, all at or under this. Flat
 * land comes out high; the sheet says "ca.".
 */
const BYTES_PER_TILE = 350_000;
const PACK_OVERHEAD = 5_000_000;

const tileX = (lng: number, z: number) => Math.floor(((lng + 180) / 360) * 2 ** z);
const tileY = (lat: number, z: number) => {
  const rad = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
};

/** Tiles a pack of `bounds` downloads, every zoom level from min to max. */
export function tileCount(
  [west, south, east, north]: Bounds,
  minZoom = OFFLINE_MIN_ZOOM,
  maxZoom = OFFLINE_MAX_ZOOM,
): number {
  let count = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const xs = tileX(east, z) - tileX(west, z) + 1;
    const ys = tileY(south, z) - tileY(north, z) + 1;
    count += Math.max(0, xs) * Math.max(0, ys);
  }
  return count;
}

export const estimateBytes = (bounds: Bounds) => PACK_OVERHEAD + tileCount(bounds) * BYTES_PER_TILE;

/**
 * The part of a viewport the user sees above a sheet: the sheet covers `coveredFraction` of the
 * map's height from the bottom (latitude scales close enough to linearly at region size).
 */
export function boundsAboveSheet(
  [west, south, east, north]: Bounds,
  coveredFraction: number,
): Bounds {
  const covered = Math.max(0, Math.min(0.9, coveredFraction));
  return [west, south + (north - south) * covered, east, north];
}

/** A rectangle on the screen, as shares of the map's width and height in from each edge. */
export type ScreenFrame = { top: number; right: number; bottom: number; left: number };

/**
 * The region being framed (offline-map, as the PWA): a fixed rectangle over the map, clear of the
 * status bar and above the step sheet at its taller height (55 %); the map moves under it.
 */
export const REGION_FRAME: ScreenFrame = { top: 0.12, right: 0.06, bottom: 0.58, left: 0.06 };

/** The map area under `frame` when the map shows `bounds`. */
export function framedBounds([west, south, east, north]: Bounds, frame: ScreenFrame): Bounds {
  const [w, h] = [east - west, north - south];
  return [
    west + w * frame.left,
    south + h * frame.bottom,
    east - w * frame.right,
    north - h * frame.top,
  ];
}

/**
 * Switzerland as four packs rather than one (S3: one 2.7 GB pack is too large to start, resume
 * or evict sensibly): west, centre-west, centre-east, east, overlapping a little.
 */
export const SWITZERLAND_REGIONS: { key: string; bounds: Bounds }[] = [
  { key: 'west', bounds: [5.95, 45.81, 7.2, 47.5] },
  { key: 'centreWest', bounds: [7.15, 45.85, 8.35, 47.82] },
  { key: 'centreEast', bounds: [8.3, 45.81, 9.45, 47.82] },
  { key: 'east', bounds: [9.4, 46.2, 10.5, 47.7] },
];
