import type { GeoJSONSourceRef } from '@maplibre/maplibre-react-native';
import {
  getVersion,
  Map as GLMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import { createLogger } from '@/core/logging/logger';
import { useLatest } from '@/core/use-latest';
import {
  SKI_ROUTES_TILEJSON,
  TRAIL_OVERLAYS,
  wmtsTileUrl,
} from '@/features/map/data/trail-overlays';
import type { LngLat } from '@/features/map/domain/entities/trail';

import { loadMarkerImages } from './marker-images.web';
import { BASE_STYLES } from './map-styles';
import type { TourMapProps } from './tour-map';
import {
  framePadding,
  overlaySourceId,
  SKI_SOURCE,
  TOURS_CLUSTER,
  tourMapLayers,
  type TourMapLayers,
} from './tour-map-layers';

export { CLUSTER_LAYER, SKI_HALO_LAYER, TOUR_LAYERS } from './tour-map-layers';

const log = createLogger('TourMap');
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

// GL JS 6 is an ES module that finds its worker next to itself; Metro bundles it elsewhere, so
// `postinstall` copies the worker into `public/`.
setWorkerUrl(`/maplibre-gl-worker.mjs?v=${getVersion()}`);

const allLayers = (layers: TourMapLayers) => [
  ...layers.overlays,
  ...layers.ski,
  ...layers.lines,
  ...layers.tours,
  ...layers.points,
];

/**
 * The Swisstopo map on the web (GL JS; `tour-map.tsx` is MapLibre Native): the same base maps and
 * layer stack. A base map switch reloads the style, so the app's sources and layers go back on top
 * of each new one. Images draw on demand. The web is online only (D8): no offline packs.
 */
export function TourMap({
  styleIndex,
  overlays,
  tours,
  lines,
  points,
  dimTrails = false,
  drawing = false,
  padding,
  initialCenter,
  initialZoom,
  onPress,
  onRegionDidChange,
  ref,
  toursSourceRef,
}: TourMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GLMap | null>(null);
  const appliedStyle = useRef<unknown>(null);
  const style = (BASE_STYLES[styleIndex] ?? BASE_STYLES[0]!).style as string | StyleSpecification;
  const layers = useMemo(() => tourMapLayers({ overlays, dimTrails }), [overlays, dimTrails]);
  const latest = useLatest({ layers, tours, lines, points, padding, onPress, onRegionDidChange });
  const initial = useLatest({ style, initialCenter, initialZoom });

  useEffect(() => {
    const { style: first, initialCenter: center, initialZoom: zoom } = initial.current;
    const map = new GLMap({
      container: container.current!,
      style: first,
      center,
      zoom,
      attributionControl: { compact: true },
    });
    appliedStyle.current = first;
    mapRef.current = map;
    map.addControl(new NavigationControl({ showZoom: false }), 'top-right');

    map.setMissingStyleImageResolver(async (id) => {
      const image = (await loadMarkerImages())[id];
      if (image && !map.hasImage(id))
        map.addImage(id, image.image, { pixelRatio: image.pixelRatio });
    });

    // Every style load, the first and each base map switch, starts without the app's layers.
    map.on('style.load', () => {
      const { layers: now, tours: data, lines: track, points: pins } = latest.current;
      try {
        TRAIL_OVERLAYS.forEach((overlay) =>
          map.addSource(overlaySourceId(overlay.id), {
            type: 'raster',
            tiles: [wmtsTileUrl(overlay.layerBodId)],
            tileSize: 256,
            maxzoom: overlay.maxzoom,
          }),
        );
        map.addSource(SKI_SOURCE, { type: 'vector', url: SKI_ROUTES_TILEJSON });
        map.addSource('lines', { type: 'geojson', data: track ?? EMPTY });
        map.addSource('tours', { type: 'geojson', data, ...TOURS_CLUSTER });
        map.addSource('points', { type: 'geojson', data: pins ?? EMPTY });
        allLayers(now).forEach((layer) => map.addLayer(layer));
      } catch (error) {
        log.error('Adding the map layers failed', error);
      }
    });

    map.on('click', (event) =>
      latest.current.onPress?.(
        [event.lngLat.lng, event.lngLat.lat],
        [event.point.x, event.point.y],
      ),
    );
    const reportRegion = () => {
      const center = map.getCenter();
      const bounds = map.getBounds();
      latest.current.onRegionDidChange?.([center.lng, center.lat], map.getZoom(), [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
    };
    map.on('load', reportRegion);
    map.on('moveend', reportRegion);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [initial, latest]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyle.current === style) return;
    appliedStyle.current = style;
    map.setStyle(style, { diff: false });
  }, [style]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of allLayers(layers)) {
      if (!map.getLayer(layer.id)) continue;
      // Unchanged values are no-ops: GL JS compares before it restyles.
      Object.entries(layer.layout ?? {}).forEach(([key, value]) =>
        map.setLayoutProperty(layer.id, key as never, value as never),
      );
      Object.entries('paint' in layer ? (layer.paint ?? {}) : {}).forEach(([key, value]) =>
        map.setPaintProperty(layer.id, key as never, value as never),
      );
    }
  }, [layers]);

  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>('tours')?.setData(tours);
  }, [tours]);
  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>('lines')?.setData(lines ?? EMPTY);
  }, [lines]);
  useEffect(() => {
    mapRef.current?.getSource<GeoJSONSource>('points')?.setData(points ?? EMPTY);
  }, [points]);

  useEffect(() => {
    const zoom = mapRef.current?.doubleClickZoom;
    if (drawing) zoom?.disable();
    else zoom?.enable();
  }, [drawing]);

  // The attribution and the compass stay clear of the chrome and sheets.
  useEffect(() => {
    const root = container.current;
    const bottom = root?.querySelector<HTMLElement>('.maplibregl-ctrl-bottom-right');
    const top = root?.querySelector<HTMLElement>('.maplibregl-ctrl-top-right');
    if (bottom) bottom.style.marginBottom = `${padding.bottom}px`;
    if (top) top.style.marginTop = `${padding.top}px`;
  }, [padding.bottom, padding.top]);

  useImperativeHandle(ref, () => ({
    flyTo: (center, zoom) =>
      mapRef.current?.easeTo({ center, zoom, padding: latest.current.padding, duration: 600 }),
    fitBounds: (sw, ne) =>
      mapRef.current?.fitBounds([sw, ne], {
        padding: framePadding(latest.current.padding),
        duration: 600,
      }),
    queryAt: async ([x, y], ids) => {
      const map = mapRef.current;
      const present = ids.filter((id) => map?.getLayer(id));
      if (!map || !present.length) return [];
      return map.queryRenderedFeatures(
        [
          [x - 12, y - 12],
          [x + 12, y + 12],
        ],
        { layers: present },
      );
    },
    center: async () => (mapRef.current?.getCenter().toArray() ?? [0, 0]) as LngLat,
    zoom: async () => mapRef.current?.getZoom() ?? 0,
  }));

  useImperativeHandle(toursSourceRef, () => {
    const source = () => mapRef.current?.getSource<GeoJSONSource>('tours');
    return {
      getClusterExpansionZoom: async (clusterId: number) =>
        (await source()?.getClusterExpansionZoom(clusterId)) ?? 0,
      getClusterLeaves: async (clusterId: number, limit: number, offset: number) =>
        (await source()?.getClusterLeaves(clusterId, limit, offset)) ?? [],
    } as unknown as GeoJSONSourceRef;
  });

  return <div ref={container} style={{ position: 'absolute', inset: 0 }} />;
}
