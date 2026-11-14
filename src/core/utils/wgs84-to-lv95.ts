/**
 * Approximate WGS84 (EPSG:4326) → LV95 (EPSG:2056) coordinate transformation.
 *
 * Uses the swisstopo "Approximate formulas for the transformation between Swiss
 * projection coordinates and WGS84" (document ch1903wgs84_f.pdf).
 * Accuracy: better than 1 m within Switzerland.
 *
 * @param lng Longitude in decimal degrees (WGS84)
 * @param lat Latitude in decimal degrees (WGS84)
 * @returns LV95 easting (E) and northing (N) in meters
 */
export function wgs84ToLv95(lng: number, lat: number): { easting: number; northing: number } {
  // Convert degrees to arc-seconds, then shift to Bern origin (2°32'05.1220"E, 46°57'08.6600"N)
  const lngSec = lng * 3600;
  const latSec = lat * 3600;

  const lngShifted = (lngSec - 26782.5) / 10000;
  const latShifted = (latSec - 169028.66) / 10000;

  // Easting (E) in meters
  const easting =
    2600072.37 +
    211455.93 * lngShifted -
    10938.51 * lngShifted * latShifted -
    0.36 * lngShifted * latShifted ** 2 -
    44.54 * lngShifted ** 3;

  // Northing (N) in meters
  const northing =
    1200147.07 +
    308807.95 * latShifted +
    3745.25 * lngShifted ** 2 +
    76.63 * latShifted ** 2 -
    194.56 * lngShifted ** 2 * latShifted +
    119.79 * latShifted ** 3;

  return { easting, northing };
}
