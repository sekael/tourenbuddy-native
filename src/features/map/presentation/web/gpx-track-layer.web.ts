// Ported from the PWA's features/map/presentation/components/gpx-track-layer.ts (port-pwa-web): MapLibre GL JS on the web.
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { TourType } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import {
  distinctTypeColors,
  TOUR_TYPE_COLORS,
  TOUR_TYPE_TRACK_COLORS,
} from '@/features/tours/data/models/tour-type';
import { gpxCache } from '@/features/tours/data/services/gpx-cache';
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';
import { isSameGoal } from '@/features/tours/domain/distance';
import { outingGaps } from '@/features/tours/domain/outing';
import { progressNearest } from '@/features/tours/domain/route-metrics';
import { DETAIL_CIRCLE_LAYER_ID, fadeLayer, TOUR_LAYER_IDS } from './tours-marker-layer.web';

const GPX_SOURCE_ID = 'gpx-track';
const GPX_LAYER_ID = 'gpx-track-line';
const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const FALLBACK_TRACK_COLOR = '#555555';
/** Each colour gets this many bands along the track. */
const BAND_CYCLES = 9;
/** Share of a band held solid; the rest fades into the next band's colour. */
const BAND_HOLD = 0.8;

/** Stops banding `colors` over [from, to] of the line: `BAND_CYCLES` rounds per full length. */
function bandStops(colors: readonly string[], from: number, to: number): (number | string)[] {
  if (colors.length <= 1) {
    const color = colors[0] ?? FALLBACK_TRACK_COLOR;
    return [from, color, to, color];
  }
  const stops: (number | string)[] = [];
  const bands = colors.length * Math.max(1, Math.round(BAND_CYCLES * (to - from)));
  const width = (to - from) / bands;
  for (let i = 0; i < bands; i++) {
    const color = colors[i % colors.length]!;
    stops.push(from + i * width, color, from + (i + BAND_HOLD) * width, color);
  }
  stops.push(to, colors[(bands - 1) % colors.length]!);
  return stops;
}

/** Where a split track switches colour (activity-legs D5): the way-down colours from `at` on. */
interface LegSplit {
  at: number;
  colors: readonly string[];
}
/** Closer to either end than this, the track holds only one leg's colours. */
const SPLIT_EDGE = 0.001;

/**
 * `line-gradient` over the track's length (D8). One colour → solid. Several → `BAND_CYCLES`
 * rounds of equal bands, each holding its colour then fading smoothly into the next. A `split`
 * switches to the way down's colours at its progress.
 * ponytail: bands scale with track length (progress-based); switch to distance-based bands if a
 * very long track reads badly.
 */
export function trackGradient(
  colors: readonly string[],
  split?: LegSplit,
): ExpressionSpecification {
  const stops =
    !split || split.at >= 1 - SPLIT_EDGE
      ? bandStops(colors, 0, 1)
      : split.at <= SPLIT_EDGE
        ? bandStops(split.colors, 0, 1)
        : [
            ...bandStops(colors, 0, split.at),
            ...bandStops(split.colors, split.at + SPLIT_EDGE / 10, 1),
          ];
  // `interpolate` is a fixed-arity tuple in the MapLibre types; the stop pairs are correct
  // by construction (strictly ascending inputs, colour outputs).
  return [
    'interpolate',
    ['linear'],
    ['line-progress'],
    ...stops,
  ] as unknown as ExpressionSpecification;
}

const ARROW_SOURCE_ID = 'tour-connector';
export const ARROW_LAYER_ID = 'tour-connector-arrow';
const CONNECTOR_WIDTH = 2;
const CONNECTOR_OPACITY = 0.7;
/** Screen distance between arrows along a leg; a shorter leg gets one in its middle. */
const ARROW_SPACING = 120;
const GAP_SOURCE_ID = 'outing-gap';
const GAP_LAYER_ID = 'outing-gap-line';
const GAP_COLOR = '#334155';

/**
 * Dashed dark links where an outing's segment starts away from where the previous one
 * finishes (`outingGaps`): the chain is broken — a reorder, a moved point, or a transfer.
 * `tours` is the shown list; only an outing's segments come as more than one.
 */
export function outingGapLines(
  tours: readonly Tour[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: outingGaps(tours).map(({ from, to }) => ({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      },
    })),
  };
}

/** Track colour at `progress` along a line banded by `trackGradient` (held part of a band). */
function colorAt(colors: readonly string[], progress: number): string {
  if (colors.length <= 1) return colors[0] ?? FALLBACK_TRACK_COLOR;
  const bands = colors.length * BAND_CYCLES;
  return colors[Math.min(bands - 1, Math.floor(progress * bands)) % colors.length]!;
}

interface LngLat {
  lng: number;
  lat: number;
}

const arrowImageId = (color: string, both: boolean) =>
  `connector-arrow${both ? '-both' : ''}:${color}`;

interface ConnectorLeg {
  /** The leg's activities: the way up or down of a split tour, else all of them. */
  types: readonly TourType[];
  feature: GeoJSON.Feature<GeoJSON.LineString>;
}

/**
 * Straight legs start → goal → end of a tour WITHOUT a GPX track (its track says it better),
 * banded in its activity colours like a track — the marker palette, so a segment's connector
 * matches its markers; `arrow` names the arrow image in the colour under the leg's centre. A
 * split tour's legs wear their own leg's activities (activity-legs D5).
 * ponytail: arrows repeat along a banded leg in that one colour; colour per arrow needs
 * self-placed point anchors. A round trip (end = start) is one leg with a two-way arrow — unless
 * split: one arrow can't wear two legs' colours, so both legs are drawn, the way down on top. A
 * start without an end is the single leg to the goal, an end without a start (a connected stage)
 * the single leg from the goal to the end; a leg between coinciding points is dropped.
 */
function connectorLegs(tour: Tour): ConnectorLeg[] {
  const { startPoint: start, endPoint: end, goal, legs } = tour;
  if (tour.gpxFilepath) return [];
  const roundTrip = !legs && !!start && !!end && isSameGoal(end, start);
  const leg = (types: readonly TourType[], a: LngLat, b: LngLat, both: boolean): ConnectorLeg[] =>
    isSameGoal(a, b)
      ? []
      : [
          {
            types,
            feature: {
              type: 'Feature',
              properties: {
                arrow: arrowImageId(
                  colorAt(distinctTypeColors(types, TOUR_TYPE_COLORS), 0.5),
                  both,
                ),
              },
              geometry: {
                type: 'LineString',
                coordinates: [
                  [a.lng, a.lat],
                  [b.lng, b.lat],
                ],
              },
            },
          },
        ];
  return [
    ...(start ? leg(legs?.ascent ?? tour.tourTypes, start, goal, roundTrip) : []),
    ...(end && !roundTrip ? leg(legs?.descent ?? tour.tourTypes, goal, end, false) : []),
  ];
}

/** What a slot draws: a GPX track (`legs` null) or connector legs, in `types`' colours. */
interface TrackSlot {
  tour: Tour;
  types: readonly TourType[];
  legs: GeoJSON.FeatureCollection<GeoJSON.LineString> | null;
}

function collection(legs: readonly ConnectorLeg[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return { type: 'FeatureCollection', features: legs.map((l) => l.feature) };
}

export function tourConnectors(
  tours: readonly Tour[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return collection(tours.flatMap(connectorLegs));
}

/** A split tour's single-line track switches colour at the vertex nearest the goal (D5). */
function trackSplit(tour: Tour, track: GeoJSON.FeatureCollection | null): LegSplit | undefined {
  const geometry = track?.features.length === 1 ? track.features[0]!.geometry : null;
  // ponytail: a multi-line track keeps the union bands; split per line if such files show up.
  if (!tour.legs || geometry?.type !== 'LineString') return undefined;
  return {
    at: progressNearest(geometry.coordinates, tour.goal),
    colors: distinctTypeColors(tour.legs.descent, TOUR_TYPE_TRACK_COLORS),
  };
}

/** A thin chevron pointing along +x (line direction); `both` adds a mirrored one, well apart. */
function drawArrow(color: string, both: boolean, pixelRatio: number): ImageData | null {
  const w = both ? 40 : 10;
  const h = 10;
  const canvas = document.createElement('canvas');
  canvas.width = w * pixelRatio;
  canvas.height = h * pixelRatio;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(pixelRatio, pixelRatio);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(w - 6, 2);
  ctx.lineTo(w - 2, 5);
  ctx.lineTo(w - 6, 8);
  if (both) {
    ctx.moveTo(6, 2);
    ctx.lineTo(2, 5);
    ctx.lineTo(6, 8);
  }
  ctx.stroke();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

const TRACK_OPACITY = 0.85;

export function createGpxTrackLayer(map: MapLibreMap) {
  const cache = gpxCache;
  /** Track slots added to the current style (source + layer `…-<i>`); reset by a style switch. */
  let slots = 0;
  /** Bumped per update: a fetch that resolves after a newer update must not draw (D16). */
  let generation = 0;
  /** Each slot's line opacity; drawn as 0 while the scene is faded out (D20). */
  const slotOpacity: number[] = [];
  let visible = true;

  const sourceId = (i: number) => `${GPX_SOURCE_ID}-${i}`;
  const layerId = (i: number) => `${GPX_LAYER_ID}-${i}`;

  /** Call after every style load: the style dropped every track source and layer. */
  function setup() {
    slots = 0;
    slotOpacity.length = 0;
    visible = true;
  }

  function setSlotOpacity(i: number, value: number) {
    slotOpacity[i] = value;
    map.setPaintProperty(layerId(i), 'line-opacity', visible ? value : 0);
  }

  /** Fade the tracks, connectors and gaps out or back in with the markers' scene (D20). */
  function setVisible(show: boolean) {
    visible = show;
    for (let i = 0; i < slots; i++)
      fadeLayer(map, layerId(i), 'line-opacity', slotOpacity[i] ?? TRACK_OPACITY, show);
    fadeLayer(map, ARROW_LAYER_ID, 'icon-opacity', CONNECTOR_OPACITY, show);
    fadeLayer(map, GAP_LAYER_ID, 'line-opacity', 1, show);
  }

  function addSlot(i: number) {
    map.addSource(sourceId(i), {
      type: 'geojson',
      data: EMPTY_GEOJSON,
      // `line-progress` (the gradient's input) needs per-line distance metrics.
      lineMetrics: true,
    });
    // Sit below the start/end detail markers when present (so markers stay above
    // the track), else below the goal circle layers.
    map.addLayer(
      {
        id: layerId(i),
        type: 'line',
        source: sourceId(i),
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-gradient': trackGradient([]),
          'line-width': 3,
          'line-opacity': visible ? TRACK_OPACITY : 0,
        },
      },
      // Under the connector arrows, which sit under the markers.
      ARROW_LAYER_ID,
    );
  }

  /** The arrow source + layer, once per style (a style switch drops them); tracks go below. */
  function ensureArrows() {
    if (map.getSource(ARROW_SOURCE_ID)) return;
    map.addSource(ARROW_SOURCE_ID, { type: 'geojson', data: EMPTY_GEOJSON });
    const pixelRatio = window.devicePixelRatio || 1;
    for (const color of new Set([...Object.values(TOUR_TYPE_COLORS), FALLBACK_TRACK_COLOR])) {
      for (const both of [false, true]) {
        const id = arrowImageId(color, both);
        const image = map.hasImage(id) ? null : drawArrow(color, both, pixelRatio);
        if (image) map.addImage(id, image, { pixelRatio });
      }
    }
    // Below the start/end detail markers when present, else below the goal circles.
    const beforeId = map.getLayer(DETAIL_CIRCLE_LAYER_ID)
      ? DETAIL_CIRCLE_LAYER_ID
      : TOUR_LAYER_IDS.find((id) => map.getLayer(id));
    map.addLayer(
      {
        id: ARROW_LAYER_ID,
        type: 'symbol',
        source: ARROW_SOURCE_ID,
        layout: {
          // Evenly spaced on screen; `line-center` would centre one per tile-clipped piece.
          'symbol-placement': 'line',
          'symbol-spacing': ARROW_SPACING,
          'icon-image': ['get', 'arrow'],
          'icon-rotation-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: { 'icon-opacity': CONNECTOR_OPACITY },
      },
      beforeId,
    );
    map.addSource(GAP_SOURCE_ID, { type: 'geojson', data: EMPTY_GEOJSON });
    // Below the arrows; track slots are inserted above it (also before the arrows).
    map.addLayer(
      {
        id: GAP_LAYER_ID,
        type: 'line',
        source: GAP_SOURCE_ID,
        layout: { 'line-cap': 'round' },
        paint: {
          // Dark slate, not the timeline's amber: amber is the paragliding colour on the map (D21).
          'line-color': GAP_COLOR,
          'line-width': 2,
          'line-dasharray': [2, 2],
        },
      },
      ARROW_LAYER_ID,
    );
  }

  /**
   * One slot per entry with something to draw: its GPX track, else its connector legs (same
   * activity gradient, thinner, lighter). Every other slot is emptied. `gaps: false` for entries
   * that aren't a run of segments (a draft's stages without their drawn tracks).
   */
  async function updateTracks(tours: Tour[], { gaps = true } = {}) {
    const gen = ++generation;
    ensureArrows();
    map.getSource<GeoJSONSource>(ARROW_SOURCE_ID)?.setData(tourConnectors(tours));
    map.getSource<GeoJSONSource>(GAP_SOURCE_ID)?.setData(outingGapLines(gaps ? tours : []));
    // A split tour's connector legs take a slot each, so each wears its own leg's gradient.
    const shown = tours.flatMap((tour): TrackSlot[] => {
      if (tour.gpxFilepath)
        return [{ tour, types: tour.legs?.ascent ?? tour.tourTypes, legs: null }];
      const legs = connectorLegs(tour);
      if (tour.legs)
        return legs.map((leg) => ({ tour, types: leg.types, legs: collection([leg]) }));
      return legs.length ? [{ tour, types: tour.tourTypes, legs: collection(legs) }] : [];
    });
    while (slots < shown.length) addSlot(slots++);

    for (let i = shown.length; i < slots; i++)
      map.getSource<GeoJSONSource>(sourceId(i))?.setData(EMPTY_GEOJSON);

    await Promise.all(
      shown.map(async ({ tour, types, legs }, i) => {
        const source = map.getSource<GeoJSONSource>(sourceId(i));
        const palette = legs ? TOUR_TYPE_COLORS : TOUR_TYPE_TRACK_COLORS;
        // Recolour BEFORE the data lands so a cached track never flashes the previous tour's colours.
        map.setPaintProperty(
          layerId(i),
          'line-gradient',
          trackGradient(distinctTypeColors(types, palette)),
        );
        map.setPaintProperty(layerId(i), 'line-width', legs ? CONNECTOR_WIDTH : 3);
        setSlotOpacity(i, legs ? CONNECTOR_OPACITY : TRACK_OPACITY);
        if (legs) {
          source?.setData(legs);
          return;
        }
        // Empty the slot while loading, so it never shows the track it held before.
        const gpxTour = tour as Tour & { gpxFilepath: string };
        if (!cache.get(gpxTour.gpxFilepath)) source?.setData(EMPTY_GEOJSON);
        const geojson = await loadGpxTrack(gpxTour);
        if (gen !== generation) return;
        // Same task as the data, so the split lands with the track it was measured on.
        const split = trackSplit(tour, geojson);
        if (split)
          map.setPaintProperty(
            layerId(i),
            'line-gradient',
            trackGradient(distinctTypeColors(types, palette), split),
          );
        source?.setData(geojson ?? EMPTY_GEOJSON);
      }),
    );
  }

  return { setup, updateTracks, setVisible };
}
