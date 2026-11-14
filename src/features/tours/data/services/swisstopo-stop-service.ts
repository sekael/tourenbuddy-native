import { z } from 'zod';
import { haversineMeters } from '@/core/utils/haversine';

const TIMEOUT_MS = 5000;
/** Half the identify window in degrees (≈ 9 km north–south); the radius below trims it round. */
const WINDOW_DEG = 0.08;
/** Trailheads of big summits lie 6–8 km off (Morteratsch below Piz Bernina). */
const RADIUS_M = 8000;

export interface NearbyStop {
  name: string;
  lng: number;
  lat: number;
  /** Metres from the point asked about. */
  distance: number;
}

const featureSchema = z.object({
  geometry: z.object({ coordinates: z.array(z.unknown()) }),
  properties: z.object({ name: z.string().nullish() }).passthrough(),
});
const responseSchema = z.object({ results: z.array(z.unknown()) });

/** First [lng, lat] of a Point or MultiPoint coordinate array. */
function firstPosition(coordinates: unknown[]): [number, number] | null {
  const pos = Array.isArray(coordinates[0]) ? coordinates[0] : coordinates;
  const [lng, lat] = pos as unknown[];
  return typeof lng === 'number' && typeof lat === 'number' ? [lng, lat] : null;
}

/**
 * Public-transport stops (incl. cable-car stations) within 8 km of `point`, nearest first, one
 * per name — the trailheads a tour usually starts from (design D2 of smarter-tour-creation).
 * GeoAdmin `identify` on `ch.bav.haltestellen-oev`. Rejects on HTTP failure, timeout or abort.
 */
export async function findStopsNear(
  point: { lng: number; lat: number },
  signal: AbortSignal,
): Promise<NearbyStop[]> {
  const params = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${point.lng},${point.lat}`,
    sr: '4326',
    layers: 'all:ch.bav.haltestellen-oev',
    // 100 px over ±0.08° → tolerance 60 px reaches ≥ 7 km east–west, more north–south; the
    // radius check trims it round.
    tolerance: '60',
    mapExtent: [
      point.lng - WINDOW_DEG,
      point.lat - WINDOW_DEG,
      point.lng + WINDOW_DEG,
      point.lat + WINDOW_DEG,
    ].join(','),
    imageDisplay: '100,100,96',
    returnGeometry: 'true',
    geometryFormat: 'geojson',
    limit: '50',
  });
  // ponytail: manual link instead of AbortSignal.any (iOS < 17.4 lacks it).
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort);
  const timer = setTimeout(abort, TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?${params}`,
      {
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`Stop lookup HTTP ${response.status}`);
    const nearest = new Map<string, NearbyStop>();
    for (const raw of responseSchema.parse(await response.json()).results) {
      const feature = featureSchema.safeParse(raw);
      const name = feature.success ? feature.data.properties.name?.trim() : null;
      const pos = feature.success ? firstPosition(feature.data.geometry.coordinates) : null;
      if (!name || !pos) continue;
      const distance = haversineMeters([point.lng, point.lat], pos);
      if (distance <= RADIUS_M && distance < (nearest.get(name)?.distance ?? Infinity))
        nearest.set(name, { name, lng: pos[0], lat: pos[1], distance });
    }
    return [...nearest.values()].sort((a, b) => a.distance - b.distance);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
