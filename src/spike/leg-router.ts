import { lineLength } from './vendor/drawn-track';
import { haversineMeters } from './vendor/haversine';
import type { SnapNetwork } from './vendor/snap-network';
import {
  buildNetwork,
  metersPerUnit,
  type Network,
  routeToTap,
  snapTo,
  toLngLat,
  toUnits,
} from './vendor/track-routing';
import { loadNetworkLines, TooFarError } from './vendor/trail-network-service';
import type { LngLat } from './vendor/trail';

// `resolve()` from the Vue use-leg-router.ts, minus `ref`: same constants, same steps.
const JOIN_M = 3;
const BRIDGE_M = 30;
const MARGIN_M = 400;
const SLACK = 0.4;
const DETOUR = 2.5;
const DETOUR_MIN_M = 500;

export const metersPerPixel = (lat: number, zoom: number) =>
  (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
/** Touch is always the coarse pointer: 32 px reach, capped at 250 m. */
export const tapSnapM = (lat: number, zoom: number) => Math.min(250, 32 * metersPerPixel(lat, zoom));

/** S3 "snap < 100 ms" is `buildMs + routeMs` with tiles cached; `loadMs` is network + pbf decode. */
export interface LegTiming {
  loadMs: number;
  buildMs: number;
  routeMs: number;
}

let built: { key: string; net: Network } | null = null;

export async function resolve(
  network: SnapNetwork | null,
  skiTemplate: string | null,
  from: LngLat | null,
  to: LngLat,
  radiusM: number,
): Promise<{ to: LngLat; line: LngLat[] | null; timing: LegTiming | null }> {
  const straight = { to, line: from && [from, to], timing: null };
  const a = from ?? to;
  const lat = (a[1] + to[1]) / 2;
  const margin = MARGIN_M + haversineMeters(a, to) / 2;
  const dLat = margin / 111_320;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const bbox: [number, number, number, number] = [
    Math.min(a[0], to[0]) - dLng,
    Math.min(a[1], to[1]) - dLat,
    Math.max(a[0], to[0]) + dLng,
    Math.max(a[1], to[1]) + dLat,
  ];
  const mpu = metersPerUnit(lat);

  const t0 = performance.now();
  let lines;
  try {
    lines = await loadNetworkLines(network, bbox, network === 'ski' ? skiTemplate : null);
  } catch (err) {
    if (!(err instanceof TooFarError)) console.warn('network unavailable', err);
    return straight;
  }
  const t1 = performance.now();
  if (built?.key !== lines.key)
    built = { key: lines.key, net: buildNetwork(lines.lines, JOIN_M / mpu, BRIDGE_M / mpu) };
  const t2 = performance.now();

  const net = built.net;
  const radius = radiusM / mpu;
  const nearest = snapTo(net, toUnits(to), radius);
  const start = from && snapTo(net, toUnits(from), radius);
  const line = start && routeToTap(net, start, toUnits(to), radius, radius * SLACK)?.points.map(toLngLat);
  const timing = { loadMs: t1 - t0, buildMs: t2 - t1, routeMs: performance.now() - t2 };

  const direct = from ? haversineMeters(from, to) : 0;
  if (!line || lineLength(line) > Math.max(DETOUR * direct, direct + DETOUR_MIN_M)) {
    const landed = nearest ? toLngLat(nearest.point) : to;
    return { to: landed, line: from && [from, landed], timing };
  }
  const landed = line.at(-1)!;
  if (haversineMeters(from!, line[0]!) > 1) line.unshift(from!);
  else line[0] = from!;
  return { to: landed, line, timing };
}
