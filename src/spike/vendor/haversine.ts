/** Great-circle distance in metres between two `[lng, lat]` points. */
export function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const lat1 = (a[1] * Math.PI) / 180
  const lat2 = (b[1] * Math.PI) / 180
  const sinDlat2 = Math.sin(dLat / 2)
  const sinDlng2 = Math.sin(dLng / 2)
  const aa = sinDlat2 * sinDlat2 + Math.cos(lat1) * Math.cos(lat2) * sinDlng2 * sinDlng2
  return R * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa))
}
