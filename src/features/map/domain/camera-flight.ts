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

/** A lone goal's zoom, and the closest a framed tour or outing comes (the PWA's `TOUR_ZOOM`). */
export const TOUR_ZOOM = 12;
/** The closest a chosen ski route comes: a short one fills the map (the PWA's `ROUTE_ZOOM`). */
export const ROUTE_ZOOM = 15;
/** A cluster tap frames its tours no closer than this, unless its split needs more. */
export const CLUSTER_FIT_MAX_ZOOM = 15.5;
/**
 * What swisstopo's base map covers: its tiles.json `bounds` ([3.57, 44.18, 13.66, 48.88]), west and
 * east a little inside them, where the relief's ragged edge still draws. Beyond: only white.
 */
export const MAP_COVERAGE: Box = [3.75, 44.18, 13.5, 48.88];
/** Where the map opens and how far out it may go: Switzerland's middle. */
const SWISS_LAT = 46.8;

/**
 * The furthest out the map goes on a view `height` points tall (the PWA's `minZoom`, 5.8, at least):
 * all of Switzerland, but never so far that the white beyond the base map shows above or below it.
 */
export function minZoomFor(height: number): number {
  const [, south, , north] = MAP_COVERAGE;
  const [, middle] = project([0, SWISS_LAT]);
  const room = Math.min(middle - project([0, north])[1], project([0, south])[1] - middle);
  return Math.max(5.8, Math.log2(height / 2 / (room * TILE)));
}

/** West, south, east, north. */
export type Box = [number, number, number, number];

/**
 * Where the camera's centre goes so the whole view stays on the base map (`MAP_COVERAGE`): the
 * centre pulled in by half the view on each side, the middle where the view is wider than the map.
 * Null while the view lies on it already. The settle after a pan or pinch out past its edge.
 */
export function keptOnMap(view: CameraView, size: ViewSize): LngLat | null {
  const [west, south, east, north] = MAP_COVERAGE;
  const [x0, y0] = project([west, north]);
  const [x1, y1] = project([east, south]);
  const [x, y] = project(view.center);
  const scale = TILE * 2 ** view.zoom;
  const [hw, hh] = [size.width / 2 / scale, size.height / 2 / scale];
  const clamp = (v: number, lo: number, hi: number) =>
    lo > hi ? (lo + hi) / 2 : Math.min(Math.max(v, lo), hi);
  const [cx, cy] = [clamp(x, x0 + hw, x1 - hw), clamp(y, y0 + hh, y1 - hh)];
  // A hair's difference is no reason to move.
  if (Math.abs(cx - x) * scale < 1 && Math.abs(cy - y) * scale < 1) return null;
  const lng = cx * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180) / Math.PI;
  return [lng, lat];
}

/**
 * Whether the view already shows the framing about as it would land (the PWA's `frameTours`, D23):
 * every point in the `visible` part of the map (clear of its edges by a tenth), at most a level
 * further out than `to`, and the framed middle within an eighth of that part from its middle. Then
 * the map stays put: cycling a stack or reopening a tour doesn't nudge it each time.
 */
export function aboutFramed(points: LngLat[], visible: Box, zoom: number, to: CameraView): boolean {
  const [w, s, e, n] = visible;
  const [dx, dy] = [(e - w) / 10, (n - s) / 10];
  const inside = points.every(
    ([lng, lat]) => lng >= w + dx && lng <= e - dx && lat >= s + dy && lat <= n - dy,
  );
  const [lng, lat] = to.center;
  const centred =
    Math.abs(lng - (w + e) / 2) <= (e - w) / 8 && Math.abs(lat - (s + n) / 2) <= (n - s) / 8;
  return inside && centred && zoom >= to.zoom - 1;
}

/**
 * Where a cluster tap lands (map-integration "Cluster tap frames its tours", D24): all its tours in
 * the middle half of the part `padding` leaves, at least past the cluster's split, at least a level
 * in, and no closer than `CLUSTER_FIT_MAX_ZOOM` unless the split needs it. Centred on the tours'
 * box when the fit decides the zoom, else on the cluster itself.
 */
export function clusterView(
  spots: LngLat[],
  at: LngLat,
  splitZoom: number,
  zoom: number,
  size: ViewSize,
  padding: Insets,
): CameraView {
  const width = size.width - padding.left - padding.right;
  const height = size.height - padding.top - padding.bottom;
  const [x, y] = [Math.max(MARGIN, width / 4), Math.max(MARGIN, height / 4)];
  const middle = {
    top: padding.top + y,
    right: padding.right + x,
    bottom: padding.bottom + y,
    left: padding.left + x,
  };
  const lngs = spots.map((p) => p[0]);
  const lats = spots.map((p) => p[1]);
  const fit = spots.length
    ? fittedView(
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
        size,
        middle,
      )
    : null;
  const fitZoom = Math.min(fit?.zoom ?? -Infinity, CLUSTER_FIT_MAX_ZOOM);
  const target = Math.min(MAX_ZOOM, Math.max(splitZoom + 0.01, fitZoom, zoom + 1));
  return target === fitZoom && fit
    ? { center: fit.center, zoom: target }
    : { center: at, zoom: target };
}

/** Least room around a tapped cluster's tours, in points. */
const MARGIN = 48;
const MAX_ZOOM = 22;

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
  // The middle on the map (Mercator), not halfway in degrees: a tall box's sits a little north.
  const y = (south + north) / 2;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  return { center: [(sw[0] + ne[0]) / 2, lat], zoom: Math.min(zoom, MAX_ZOOM) };
}
