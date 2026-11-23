// Ported from the PWA's features/map/presentation/composables/frame-tour.ts (port-pwa-web): MapLibre GL JS on the web.
import type {
  CameraOptions,
  LngLatLike,
  Map as MaplibreMap,
  PaddingOptions,
  PointLike,
} from 'maplibre-gl';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { LngLatBounds } from 'maplibre-gl';

/** A lone goal's zoom — and the ceiling when framing several points, so close ones look the same. */
export const TOUR_ZOOM = 12;
/** Ceiling for framing a chosen ski route: short routes fill the map, a near-point one stays readable. */
export const ROUTE_ZOOM = 15;
/** Room around the framed points for the markers themselves (more on top: notch / status bar). */
const MARGIN = { top: 64, right: 48, bottom: 48, left: 48 };
/**
 * Every camera flight's speed — calmer than MapLibre's 1.2 so tiles load as the map moves.
 * About half a second per zoom level; a long hop takes longer than a short one.
 */
export const FLIGHT_SPEED = 1.1;
/** A hop of up to a screen (the next stage, a level in) glides this long (D21). */
export const GLIDE_MS = 1000;

/**
 * Move the camera calmly (D17, D21): a hop of up to a screen and two levels glides in `GLIDE_MS`
 * — a flight that short would take a third to two thirds of a second — anything further flies at
 * `FLIGHT_SPEED`, which takes longer than that.
 */
export function moveCalmly(map: MaplibreMap, camera: CameraOptions & { offset?: PointLike }) {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const to = map.project(camera.center ?? map.getCenter());
  const near =
    Math.hypot(to.x - w / 2, to.y - h / 2) <= Math.max(w, h) &&
    Math.abs((camera.zoom ?? map.getZoom()) - map.getZoom()) <= 2;
  if (near) map.easeTo({ ...camera, duration: GLIDE_MS });
  else map.flyTo({ ...camera, speed: FLIGHT_SPEED });
}

/** `margin` around the framed points, plus whatever the sheet or drawer covers. */
export function paddingBeside(covered: Partial<PaddingOptions>, margin: typeof MARGIN = MARGIN) {
  return {
    top: margin.top + (covered.top ?? 0),
    right: margin.right + (covered.right ?? 0),
    bottom: margin.bottom + (covered.bottom ?? 0),
    left: margin.left + (covered.left ?? 0),
  };
}

/** Whether every corner of `bounds` already lies in the map area left visible beside `covered`. */
export function isBoundsVisible(
  map: MaplibreMap,
  bounds: LngLatBounds,
  covered: Partial<PaddingOptions>,
): boolean {
  const pad = paddingBeside(covered);
  const { width, height } = map.getContainer().getBoundingClientRect();
  const corners = [
    bounds.getNorthWest(),
    bounds.getNorthEast(),
    bounds.getSouthWest(),
    bounds.getSouthEast(),
  ];
  return corners.every((c) => {
    const { x, y } = map.project(c);
    return x >= pad.left && x <= width - pad.right && y >= pad.top && y <= height - pad.bottom;
  });
}

/**
 * Fly so `bounds` fills the map area left visible beside `covered` (the sheet or
 * drawer), zooming in no further than `maxZoom`. Padding is passed per call and never
 * set on the map: `fitBounds`-style framing adds the map's persistent padding on top.
 */
export function frameBounds(
  map: MaplibreMap,
  bounds: LngLatBounds,
  covered: Partial<PaddingOptions>,
  {
    fallbackCenter = bounds.getCenter(),
    maxZoom = TOUR_ZOOM,
  }: { fallbackCenter?: LngLatLike; maxZoom?: number } = {},
) {
  const camera = map.cameraForBounds(bounds, {
    padding: paddingBeside(covered),
    maxZoom,
    bearing: map.getBearing(),
  });
  // No room left to frame in (tiny viewport): just centre on the fallback, no closer
  // than a tour's zoom, so a long route isn't cut down to its middle.
  moveCalmly(map, camera ?? { center: fallbackCenter, zoom: Math.min(maxZoom, TOUR_ZOOM) });
}

/**
 * Frame the tours' goals, starts and ends (whichever exist) — one tour, or every segment of an
 * outing (#338). A lone goal is a zero-size box, so it lands centred at `TOUR_ZOOM`. A view that
 * already shows them about as framed stays put (D23): all in view, at most a level out, the frame
 * no more than an eighth of the view off — cycling a stack doesn't nudge the map each time.
 */
export function frameTours(
  map: MaplibreMap,
  tours: Pick<Tour, 'goal' | 'startPoint' | 'endPoint'>[],
  covered: Partial<PaddingOptions>,
) {
  const bounds = new LngLatBounds();
  for (const tour of tours) {
    for (const p of [tour.goal, tour.startPoint, tour.endPoint]) {
      if (p) bounds.extend([p.lng, p.lat]);
    }
  }
  const fit = map.cameraForBounds(bounds, {
    padding: paddingBeside(covered),
    maxZoom: TOUR_ZOOM,
    bearing: map.getBearing(),
  });
  if (
    fit?.center &&
    fit.zoom !== undefined &&
    map.getZoom() >= fit.zoom - 1 &&
    isBoundsVisible(map, bounds, covered)
  ) {
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const { left = 0, right = 0, top = 0, bottom = 0 } = covered;
    const { x, y } = map.project(fit.center);
    if (
      Math.abs(x - w / 2) <= (w - left - right) / 8 &&
      Math.abs(y - h / 2) <= (h - top - bottom) / 8
    )
      return;
  }
  const first = tours[0]!.goal;
  frameBounds(map, bounds, covered, { fallbackCenter: [first.lng, first.lat] });
}
