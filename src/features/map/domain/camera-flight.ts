import type { LngLat } from './entities/trail';

export type CameraView = { center: LngLat; zoom: number };
export type ViewSize = { width: number; height: number };
type Insets = { top: number; right: number; bottom: number; left: number };
export type Flight = { easing: 'ease' | 'fly'; duration: number };

/** A hop of up to a screen and two levels glides this long (the PWA's `GLIDE_MS`, D21). */
export const GLIDE_MS = 1000;
/** Every longer flight's speed: calmer than MapLibre's 1.2, so tiles load as the map moves. */
export const FLIGHT_SPEED = 1.1;
/** Across the country a flight would take four to five seconds: none takes longer than this. */
export const MAX_FLIGHT_MS = 2400;
/** MapLibre's flight curve (van Wijk & Nuij's ρ): how far out a flight zooms on its way. */
const RHO = 1.42;
const TILE = 512;

/** A point on the Web Mercator square, 0 to 1 across and down. */
const project = ([lng, lat]: LngLat): LngLat => [
  (lng + 180) / 360,
  (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2,
];

/**
 * How the camera moves from one view to another on its own (map-integration "Calm camera
 * flights", the PWA's `moveCalmly`): a hop of up to a screen and two levels glides in `GLIDE_MS`;
 * anything further flies MapLibre's zoom-out-and-in path at `FLIGHT_SPEED`, timed by the path's
 * length as MapLibre GL times its own flights, so a long flight takes longer than a short one and
 * none is squeezed into a fixed time. Never shorter than the glide, never longer than
 * `MAX_FLIGHT_MS` (the owner: "quick but smooth").
 */
export function flight(from: CameraView, to: CameraView, size: ViewSize): Flight {
  const [x0, y0] = project(from.center);
  const [x1, y1] = project(to.center);
  // The distance in pixels at the start's zoom, and the view's size before and after.
  const u1 = Math.hypot(x1 - x0, y1 - y0) * TILE * 2 ** from.zoom;
  const w0 = Math.max(size.width, size.height);
  if (u1 <= w0 && Math.abs(to.zoom - from.zoom) <= 2) {
    return { easing: 'ease', duration: GLIDE_MS };
  }
  const w1 = w0 * 2 ** (from.zoom - to.zoom);
  const rho2 = RHO * RHO;
  const r = (end: 0 | 1) => {
    const b =
      (w1 * w1 - w0 * w0 + (end ? -1 : 1) * rho2 * rho2 * u1 * u1) /
      (2 * (end ? w1 : w0) * rho2 * u1);
    return Math.log(Math.sqrt(b * b + 1) - b);
  };
  let path = (r(1) - r(0)) / RHO;
  // In place (only the zoom changes): the path is the zoom's alone.
  if (!Number.isFinite(path)) path = Math.abs(Math.log(w1 / w0)) / RHO;
  const duration = Math.round((1000 * path) / FLIGHT_SPEED);
  return { easing: 'fly', duration: Math.min(Math.max(duration, GLIDE_MS), MAX_FLIGHT_MS) };
}

/** The view a bounds fit lands on: the box's middle, at the zoom that fits it beside `padding`. */
export function fittedView(sw: LngLat, ne: LngLat, size: ViewSize, padding: Insets): CameraView {
  const [west, south] = project(sw);
  const [east, north] = project(ne);
  const width = Math.max(size.width - padding.left - padding.right, 1);
  const height = Math.max(size.height - padding.top - padding.bottom, 1);
  const zoom = Math.log2(
    Math.min(
      width / (Math.max(east - west, 1e-9) * TILE),
      height / (Math.max(south - north, 1e-9) * TILE),
    ),
  );
  return { center: [(sw[0] + ne[0]) / 2, (sw[1] + ne[1]) / 2], zoom: Math.min(zoom, 22) };
}
