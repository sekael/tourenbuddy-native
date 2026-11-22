import { wgs84ToLv95 } from '@/core/utils/wgs84-to-lv95';

export function isSameGoal(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
  thresholdMeters = 10,
): boolean {
  const lv95a = wgs84ToLv95(a.lng, a.lat);
  const lv95b = wgs84ToLv95(b.lng, b.lat);
  const dE = lv95a.easting - lv95b.easting;
  const dN = lv95a.northing - lv95b.northing;
  return Math.sqrt(dE * dE + dN * dN) <= thresholdMeters;
}
