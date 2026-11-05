/** [longitude, latitude] in WGS84. */
export type LngLat = [number, number]

/** Swisstopo ski-route attributes, already resolved to the UI language. */
export interface SkiRouteInfo {
  name: string | null
  targetName: string
  targetAltitude: number | null
  difficulty: string | null
  ascentTime: string | null
  ascentM: number | null
  descentM: number | null
  sacUrl: string | null
}

/**
 * A trail feature with its full line geometry. `overlay` stays a discriminant so
 * hiking segments can join as a union member once snapping needs them.
 */
export interface Trail {
  overlay: 'ski'
  id: string
  /** One polyline per part; a single LineString is one part. */
  lines: LngLat[][]
  /** null when Swisstopo has no route information for this line. */
  route: SkiRouteInfo | null
}
