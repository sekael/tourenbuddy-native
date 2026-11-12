/**
 * Offline regions (offline-map D10): a rectangle of the vector base map, zoom 0 to 14, and what
 * it will take on the device. Bounds are west, south, east, north.
 */
export type Bounds = [west: number, south: number, east: number, north: number];

export const OFFLINE_MIN_ZOOM = 0;
export const OFFLINE_MAX_ZOOM = 14;

/**
 * Bytes per tile, measured on whole Switzerland (S3: about 2.7 GB for 37 000 tiles, all the base
 * map's sources together), rounded up: promising too little storage is worse than too much.
 */
const BYTES_PER_TILE = 75_000;

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

export const estimateBytes = (bounds: Bounds) => tileCount(bounds) * BYTES_PER_TILE;

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
