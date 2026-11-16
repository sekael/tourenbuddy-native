import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
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
import { useImperativeHandle, useMemo, useRef, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import {
  SKI_ROUTES_TILEJSON,
  TRAIL_OVERLAYS,
  wmtsTileUrl,
  type TrailOverlayId,
} from '@/features/map/data/trail-overlays';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';
import { fittedView, flight, type CameraView } from '@/features/map/domain/camera-flight';
import type { LngLat } from '@/features/map/domain/entities/trail';

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
  fitBounds: (sw: LngLat, ne: LngLat) => void;
  /** Features under a point, from the given layers (hit-testing a tap). */
  queryAt: (point: [number, number], layers: string[]) => Promise<GeoJSON.Feature[]>;
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

// WMTS answers 400 for tiles outside Switzerland; the PWA swallowed them, here they would flood the
// log. Swallow those, log the rest.
LogManager.onLog(({ message }) => /source overlay-\w+: HTTP status code 400/.test(message));

export function TourMap({
  styleIndex,
  overlays,
  tours,
  focus,
  lines,
  points,
  areas,
  dimTrails = false,
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
  const style = BASE_STYLES[styleIndex] ?? BASE_STYLES[0]!;

  // Where the camera is and how big the map is, for how long a move there takes.
  const view = useRef<CameraView>({ center: initialCenter, zoom: initialZoom });
  const size = useRef({ width: 0, height: 0 });
  const reducedMotion = useReducedMotion();
  const move = (to: CameraView) =>
    reducedMotion ? { duration: 0, easing: undefined } : flight(view.current, to, size.current);

  useImperativeHandle(ref, () => ({
    flyTo: (center, zoom) => {
      const to = { center, zoom: zoom ?? view.current.zoom };
      cameraRef.current?.easeTo({ center, zoom, padding, ...move(to) });
    },
    fitBounds: (sw, ne) => {
      const framed = framePadding(padding);
      const to = fittedView(sw, ne, size.current, framed);
      cameraRef.current?.fitBounds([sw[0], sw[1], ne[0], ne[1]], { padding: framed, ...move(to) });
    },
    queryAt: async ([x, y], ids) =>
      (await mapRef.current?.queryRenderedFeatures(
        [
          [x - 12, y - 12],
          [x + 12, y + 12],
        ] as never,
        { layers: ids },
      )) ?? [],
    center: async () => (await mapRef.current?.getCenter()) as LngLat,
    zoom: async () => (await mapRef.current?.getZoom()) ?? 0,
  }));

  const layers = useMemo(() => tourMapLayers({ overlays, dimTrails }), [overlays, dimTrails]);
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
        onRegionDidChange?.(
          event.nativeEvent.center as LngLat,
          event.nativeEvent.zoom,
          event.nativeEvent.bounds as [number, number, number, number],
        );
      }}
    >
      <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom: initialZoom }} />
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

      {children}
    </Map>
  );
}
