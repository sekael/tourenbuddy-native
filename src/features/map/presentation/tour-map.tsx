import type { LayerSpecification, StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  LogManager,
  Map,
  RasterSource,
  VectorSource,
  type CameraRef,
  type GeoJSONSourceRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import { useEffect, useImperativeHandle, useMemo, useRef, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions } from 'react-native';

import {
  SKI_ROUTES_TILEJSON,
  TRAIL_OVERLAYS,
  wmtsTileUrl,
  type TrailOverlayId,
} from '@/features/map/data/trail-overlays';
import { createLogger } from '@/core/logging/logger';
import { isOnline } from '@/core/offline/online';
import { motion } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';
import {
  fittedView,
  flight,
  keptInFrame,
  keptOnMap,
  minZoomFor,
  type Box,
  type CameraView,
} from '@/features/map/domain/camera-flight';
import type { LngLat } from '@/features/map/domain/entities/trail';
import type { TrackCursor } from '@/features/map/domain/profile-cursor';

import { markerImages } from './marker-images';
import { BASE_STYLES } from './map-styles';
import type { TourFeatureProps } from './tour-features';
import {
  framePadding,
  labelPoints,
  overlaySourceId,
  SKI_SOURCE,
  TOURS_CLUSTER,
  tourMapLayers,
} from './tour-map-layers';

/**
 * The Swisstopo map on iOS and Android (MapLibre Native; `tour-map.web.tsx` is GL JS): the base
 * map with the layer stack of `tour-map-layers.ts` over it.
 */
export type TourMapHandle = {
  flyTo: (center: LngLat, zoom?: number) => void;
  /** Show the box whole beside the chrome and sheets, no closer than `maxZoom`. */
  fitBounds: (sw: LngLat, ne: LngLat, maxZoom?: number) => void;
  /** Features within `reach` points of a tap (12 by default), from the given layers. */
  queryAt: (
    point: [number, number],
    layers: string[],
    reach?: number,
  ) => Promise<GeoJSON.Feature[]>;
  center: () => Promise<LngLat>;
  zoom: () => Promise<number>;
};

export type LineProps = {
  color: string;
  width?: number;
  dashed?: boolean;
  /** An outing's chain of goals: round dots. */
  dotted?: boolean;
  casing?: boolean;
  opacity?: number;
  /** A straight leg's direction arrows (`arrow|<colour>` image). */
  arrow?: string;
};
export type PointProps = {
  /**
   * `start`, `end`, a preview colour circle, an outing's hand-over ring (`via`) or the "+N" chip
   * of an open tour's spot (`more`, its `image`, the tours there in `ids`).
   */
  kind: 'start' | 'end' | 'preview' | 'via' | 'more';
  color?: string;
  label?: string;
  image?: string;
  ids?: string;
};

export type TourMapProps = {
  styleIndex: number;
  overlays: readonly TrailOverlayId[];
  tours: GeoJSON.FeatureCollection<GeoJSON.Point, TourFeatureProps>;
  /** The open tour or the open outing's stages: never clustered (D15). */
  focus?: GeoJSON.FeatureCollection<GeoJSON.Point, TourFeatureProps>;
  lines?: GeoJSON.FeatureCollection<GeoJSON.LineString, LineProps>;
  points?: GeoJSON.FeatureCollection<GeoJSON.Point, PointProps>;
  /** Areas outlined on the map (saved offline regions; native only). */
  areas?: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
  /** Trails step back while a track is drawn (track-drawing). */
  dimTrails?: boolean;
  /** The overlays are a tap away: those switched off load unseen (`tourMapLayers`). */
  warmOverlays?: boolean;
  /**
   * A dot on the open tour's track where a finger on its elevation profile points, in the
   * activity's colour there. The map follows it, so it never leaves the view.
   */
  cursor?: TrackCursor | null;
  /** While drawing, tours take no taps and double-tap zoom is off (track-drawing). */
  drawing?: boolean;
  /** The area the chrome and sheets cover, so the camera frames what is left. */
  padding: { top: number; right: number; bottom: number; left: number };
  initialCenter: LngLat;
  initialZoom: number;
  onPress?: (lngLat: LngLat, point: [number, number]) => void;
  onRegionDidChange?: (
    center: LngLat,
    zoom: number,
    bounds: [number, number, number, number],
  ) => void;
  /** Annotations drawn over the map (draggable track points). */
  children?: ReactNode;
  ref?: Ref<TourMapHandle>;
  /** For `getClusterExpansionZoom` / `getClusterLeaves`. */
  toursSourceRef?: Ref<GeoJSONSourceRef>;
};

export { CLUSTER_LAYER, MORE_LAYER, SKI_HALO_LAYER, TOUR_LAYERS } from './tour-map-layers';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const cursorPoint = ({ point, color }: TrackCursor): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { color },
      geometry: { type: 'Point', coordinates: point },
    },
  ],
});
/** The profile's cursor on the map: its dot in the activity's colour, ringed white above all else. */
const CURSOR_LAYER: LayerSpecification = {
  id: 'track-cursor',
  source: 'cursor',
  type: 'circle',
  paint: {
    'circle-radius': 7,
    'circle-color': ['get', 'color'],
    'circle-stroke-width': 3,
    'circle-stroke-color': '#ffffff',
  },
};

const mapLog = createLogger('Map');

/**
 * MapLibre's own log, before it reaches the console, where an error opens the red overlay in
 * development. WMTS answers 400 for tiles outside Switzerland: swallowed, as the PWA did. A request
 * that failed (a tile, glyph, sprite or source) is the network's doing: a warning online, a debug
 * line offline, where every one fails and the offline banner already says so. The rest goes through.
 */
export function onMapLog({ tag, message }: { tag: string; message: string }): boolean {
  if (/source overlay-\w+: HTTP status code 400/.test(message)) return true;
  if (
    !tag.includes('MLNNetworkConfiguration') &&
    !/Failed to load (tile|glyph|sprite|source)/.test(message)
  )
    return false;
  if (isOnline()) mapLog.warn(message);
  else mapLog.debug(message);
  return true;
}
LogManager.onLog(onMapLog);

export function TourMap({
  styleIndex,
  overlays,
  tours,
  focus,
  lines,
  points,
  areas,
  dimTrails = false,
  warmOverlays = false,
  cursor = null,
  drawing = false,
  padding,
  initialCenter,
  initialZoom,
  onPress,
  onRegionDidChange,
  children,
  ref,
  toursSourceRef,
}: TourMapProps) {
  const { t } = useTranslation();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const images = useMemo(() => markerImages(), []);
  const { height: windowHeight } = useWindowDimensions();
  const style = BASE_STYLES[styleIndex] ?? BASE_STYLES[0]!;

  // Where the camera is and how big the map is, for how long a move there takes.
  const view = useRef<CameraView>({ center: initialCenter, zoom: initialZoom });
  const size = useRef({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();
  const move = (to: CameraView) =>
    reducedMotion ? { duration: 0, easing: undefined } : flight(view.current, to, size.current);

  // The profile's dot stays in view (tour-info-extended): past the middle of the map beside the
  // sheet, the map moves along with it at once, just so far. While a finger scrubs, the view is
  // the one this last moved to: the map's own reports of it come a moment later.
  const shown = useRef<Box | null>(null);
  const followed = useRef<Box | null>(null);
  useEffect(() => {
    if (!cursor) {
      followed.current = null;
      return;
    }
    const from = followed.current ?? shown.current;
    const pan = from && keptInFrame(from, size.current, padding, cursor.point);
    if (!pan) return;
    followed.current = pan.bounds;
    cameraRef.current?.easeTo({ center: pan.center, padding, duration: 0 });
    // The padding is the frame of the moment, not a reason to follow again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  useImperativeHandle(ref, () => ({
    flyTo: (center, zoom) => {
      const to = { center, zoom: zoom ?? view.current.zoom };
      cameraRef.current?.easeTo({ center, zoom, padding, ...move(to) });
    },
    fitBounds: (sw, ne, maxZoom = Infinity) => {
      const framed = framePadding(padding);
      const fit = fittedView(sw, ne, size.current, framed);
      if (fit.zoom <= maxZoom) {
        cameraRef.current?.fitBounds([sw[0], sw[1], ne[0], ne[1]], {
          padding: framed,
          ...move(fit),
        });
        return;
      }
      // Closer than allowed (a lone goal, a short tour): its middle at the ceiling instead.
      const to = { center: fit.center, zoom: maxZoom };
      cameraRef.current?.easeTo({ ...to, padding: framed, ...move(to) });
    },
    queryAt: async ([x, y], ids, reach = 12) =>
      (await mapRef.current?.queryRenderedFeatures(
        [
          [x - reach, y - reach],
          [x + reach, y + reach],
        ] as never,
        { layers: ids },
      )) ?? [],
    center: async () => (await mapRef.current?.getCenter()) as LngLat,
    zoom: async () => (await mapRef.current?.getZoom()) ?? 0,
  }));

  const layers = useMemo(
    () => tourMapLayers({ overlays, dimTrails, warm: warmOverlays }),
    [overlays, dimTrails, warmOverlays],
  );
  const labels = useMemo(() => labelPoints(points, focus), [points, focus]);

  return (
    <Map
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      // One element for VoiceOver (D5): thousands of features are no list to swipe through.
      accessible
      accessibilityLabel={t('map.a11y.label')}
      accessibilityHint={t('map.a11y.hint')}
      mapStyle={style.style as string | StyleSpecification}
      // The credit is the map screen's own "© swisstopo" beside its controls.
      attribution={false}
      logo={false}
      compass
      compassPosition={{ top: padding.top + 8, right: 12 }}
      compassHiddenFacingNorth
      doubleTapZoom={!drawing}
      onPress={(event) =>
        onPress?.(event.nativeEvent.lngLat as LngLat, event.nativeEvent.point as [number, number])
      }
      onLayout={(event) => {
        size.current = event.nativeEvent.layout;
      }}
      onRegionDidChange={(event) => {
        view.current = { center: event.nativeEvent.center as LngLat, zoom: event.nativeEvent.zoom };
        shown.current = event.nativeEvent.bounds as Box;
        // Panned or pinched past the base map's edge: back onto it, as a scroll view bounces.
        const back = event.nativeEvent.userInteraction
          ? keptOnMap(view.current, size.current)
          : null;
        if (back) {
          cameraRef.current?.easeTo({
            center: back,
            duration: reducedMotion ? 0 : motion.medium,
            easing: 'ease',
          });
        }
        onRegionDidChange?.(
          event.nativeEvent.center as LngLat,
          event.nativeEvent.zoom,
          event.nativeEvent.bounds as [number, number, number, number],
        );
      }}
    >
      <Camera
        ref={cameraRef}
        initialViewState={{ center: initialCenter, zoom: initialZoom }}
        // Out to Switzerland whole, never into the white past the base map (a pan past its edge
        // settles back, `keptOnMap`; MapLibre's maxBounds would hold only the centre, and cut a
        // fling short without the settle).
        minZoom={minZoomFor(windowHeight)}
      />
      <Images images={images} />

      {TRAIL_OVERLAYS.map((overlay, i) => (
        <RasterSource
          key={overlay.id}
          id={overlaySourceId(overlay.id)}
          tiles={[wmtsTileUrl(overlay.layerBodId)]}
          tileSize={256}
          maxzoom={overlay.maxzoom}
        >
          <Layer {...layers.overlays[i]!} />
        </RasterSource>
      ))}
      <VectorSource id={SKI_SOURCE} url={SKI_ROUTES_TILEJSON}>
        {layers.ski.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </VectorSource>

      <GeoJSONSource id="areas" data={areas ?? EMPTY}>
        {layers.areas.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </GeoJSONSource>

      <GeoJSONSource id="lines" data={lines ?? EMPTY}>
        {layers.lines.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </GeoJSONSource>

      <GeoJSONSource ref={toursSourceRef} id="tours" data={tours} {...TOURS_CLUSTER}>
        {layers.tours.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </GeoJSONSource>

      <GeoJSONSource id="points" data={points ?? EMPTY}>
        {layers.points.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </GeoJSONSource>

      <GeoJSONSource id="focus" data={focus ?? EMPTY}>
        {layers.focus.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </GeoJSONSource>

      <GeoJSONSource id="focus-names" data={focus ?? EMPTY}>
        {layers.focusNames.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </GeoJSONSource>

      <GeoJSONSource id="labels" data={labels}>
        {layers.labels.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </GeoJSONSource>

      <GeoJSONSource id="footprints" data={labels}>
        {layers.footprints.map((layer) => (
          <Layer key={layer.id} {...layer} />
        ))}
      </GeoJSONSource>

      <GeoJSONSource id="cursor" data={cursor ? cursorPoint(cursor) : EMPTY}>
        <Layer {...CURSOR_LAYER} />
      </GeoJSONSource>

      {children}
    </Map>
  );
}
