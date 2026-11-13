import type { GeoJSONSourceRef } from '@maplibre/maplibre-react-native';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassCapsule, GlassCircleButton } from '@/core/adaptive/map-controls';
import { color, space } from '@/core/theme/tokens';
import { haversineMeters } from '@/core/utils/haversine';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { boundsAboveSheet } from '@/features/map/domain/offline-regions';
import { loadGpxTrack } from '@/features/tours/data/services/gpx-track-service';
import { TOUR_TYPE_TRACK_COLORS } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingSegments } from '@/features/tours/domain/outing';
import { trackLines } from '@/features/tours/domain/route-metrics';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import { openTour } from './open-tour';
import { useMapStore, type MapState } from './stores/map-store';
import { sameSpot, tourFeatures } from './tour-features';
import {
  CLUSTER_LAYER,
  TOUR_LAYERS,
  TourMap,
  type LineProps,
  type PointProps,
  type TourMapHandle,
} from './tour-map';
import { legHandle, metersPerPixel } from './leg-router';
import { TrackHandles } from './track-handles';
import { lookupSkiRoutes } from './trail-lookup';

/** Where the map opens before it knows better: central Switzerland, the whole country in view. */
const SWITZERLAND_CENTER: LngLat = [8.23, 46.8];
const SWITZERLAND_ZOOM = 6.6;

type Lines = GeoJSON.FeatureCollection<GeoJSON.LineString, LineProps>;
type Points = GeoJSON.FeatureCollection<GeoJSON.Point, PointProps>;
const noLines: Lines = { type: 'FeatureCollection', features: [] };

/**
 * The Map tab (map-integration): the live Swisstopo map with every own and friends' tour, and its
 * thumb-zone chrome (D19), one row right above the tab bar: search, the "My tours | Add tour"
 * capsule and the map button (layers with previews, legend, offline maps). Tours, a tour's detail,
 * the route step and drawing open as sheets over this same map (D4).
 */
export function MapScreen({ children }: { children?: React.ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const mapRef = useRef<TourMapHandle>(null);
  const toursSourceRef = useRef<GeoJSONSourceRef>(null);

  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const mode = useMapStore((s) => s.mode);
  const styleIndex = useMapStore((s) => s.styleIndex);
  const overlays = useMapStore((s) => s.overlays);
  const selectedTourId = useMapStore((s) => s.selectedTourId);
  const selectedOutingKey = useMapStore((s) => s.selectedOutingKey);
  const camera = useMapStore((s) => s.camera);
  const tapHandler = useMapStore((s) => s.tapHandler);
  const previewLines = useMapStore((s) => s.previewLines);
  const previewPoints = useMapStore((s) => s.previewPoints);
  const trailHighlight = useMapStore((s) => s.trailHighlight);

  const allTours = useMemo(() => [...tours, ...friendTours], [tours, friendTours]);
  const selected = allTours.find((tour) => tour.id === selectedTourId) ?? null;
  const features = useMemo(
    () => tourFeatures(allTours, { selectedId: selectedTourId }),
    [allTours, selectedTourId],
  );
  const selectedLines = useSelectedLines(selected);

  // A sheet over the map covers its lower half (medium detent): frame what is left above it.
  const sheetOpen =
    selectedTourId !== null ||
    selectedOutingKey !== null ||
    trailHighlight !== null ||
    mode !== 'browse';
  const padding = {
    top: insets.top + space.lg,
    left: space.lg,
    right: space.lg,
    bottom: sheetOpen ? height * 0.5 + space.lg : insets.bottom + 120,
  };

  useEffect(() => {
    void useMapStore.getState().restoreOverlays();
  }, []);

  // Camera requests from sheets (frame a tour, fly to a search result) run once.
  useEffect(() => {
    const request = useMapStore.getState().consumeCamera();
    if (!request) return;
    if (request.kind === 'fly') mapRef.current?.flyTo(request.center, request.zoom);
    else mapRef.current?.fitBounds(request.bounds[0], request.bounds[1]);
  }, [camera]);

  // The tour shows whole above the sheet (the PWA's framing, plus its line): the open tour's goal,
  // start, end and track, or the route being planned or drawn. Framed again whenever that extent
  // changes (a point set or moved, the track loaded or rerouted), once it settles; an edit that
  // keeps it, or dragging the sheet, never moves the map (map-integration "Calm camera flights").
  const editHandles = useMapStore((s) => s.editHandles);
  const extent = useMemo(() => {
    const framed = selected ? [selected] : outingSegments(allTours, selectedOutingKey);
    const stops =
      mode === 'browse'
        ? framed.flatMap((tour) =>
            [tour.goal, tour.startPoint, tour.endPoint].flatMap((p) =>
              p ? [[p.lng, p.lat] as LngLat] : [],
            ),
          )
        : [
            ...(editHandles?.points.map((p) => p.at) ?? []),
            ...(previewPoints?.features.map((f) => f.geometry.coordinates as LngLat) ?? []),
          ];
    const line = (previewLines?.features ?? selectedLines.features).flatMap(
      (f) => f.geometry.coordinates as LngLat[],
    );
    // A ski route picked from the lookup shows whole, as a tour does.
    const chosen = trailHighlight?.trails.find((trail) => trail.id === trailHighlight.selectedId);
    return boxOf([...stops, ...line, ...(chosen?.lines.flat() ?? [])]);
  }, [
    mode,
    selected,
    allTours,
    selectedOutingKey,
    editHandles,
    previewLines,
    previewPoints,
    selectedLines,
    trailHighlight,
  ]);
  const extentKey = extent
    ?.flat()
    .map((n) => n.toFixed(4))
    .join();
  useEffect(() => {
    if (!extent) return;
    const timer = setTimeout(() => {
      const [[west, south], [east, north]] = extent;
      const lone = west === east && south === north;
      // A lone point and a drawing (the user's own taps) move the map only once out of view.
      if ((lone || mode === 'draw') && inView(extent, padding.bottom / height)) return;
      if (lone)
        mapRef.current?.flyTo([west, south], Math.max(useMapStore.getState().zoom ?? 0, 13));
      else mapRef.current?.fitBounds(...widened(extent));
    }, 300);
    return () => clearTimeout(timer);
    // The extent's key alone: a new tour, point or line, not a new array of the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extentKey]);

  async function onPress(lngLat: LngLat, point: [number, number]) {
    if (tapHandler) {
      // A tap on a handle is the handle's (it picks it); the map gets it too, so leave it be.
      if (onHandle(lngLat)) return;
      tapHandler(lngLat);
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const [hit] = await map.queryAt(point, [CLUSTER_LAYER, ...TOUR_LAYERS, 'tour-activity']);
    const props = hit?.properties ?? {};
    if (props.cluster_id != null) {
      await openCluster(Number(props.cluster_id), Number(props.point_count), hit!);
      return;
    }
    if (typeof props.id === 'string') {
      openTour(props.id);
      return;
    }
    // A ski route under the tap (trail-lookup): only where the ski overlay shows.
    if (overlays.includes('ski')) {
      const found = await lookupSkiRoutes(map, point, lngLat);
      if (found) {
        useMapStore.getState().showTrails(found.candidates, found.more);
        router.push('/trail');
      }
    }
  }

  async function openCluster(clusterId: number, count: number, hit: GeoJSON.Feature) {
    const source = toursSourceRef.current;
    if (!source) return;
    const leaves = await source.getClusterLeaves(clusterId, Math.min(count, 50), 0);
    const spots = leaves.map(
      (leaf) => (leaf.geometry as GeoJSON.Point).coordinates as [number, number],
    );
    // Tours on one spot never split by zooming: list them (map-integration "Stack list").
    if (sameSpot(spots)) {
      useMapStore.getState().showStack(leaves.map((leaf) => String(leaf.properties?.id)));
      router.push('/stack');
      return;
    }
    const zoom = await source.getClusterExpansionZoom(clusterId);
    mapRef.current?.flyTo((hit.geometry as GeoJSON.Point).coordinates as LngLat, zoom);
  }

  const lines: Lines = useMemo(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...(previewLines?.features ?? selectedLines.features),
        ...highlightLines(trailHighlight),
      ],
    }),
    [previewLines, selectedLines, trailHighlight],
  );
  const points: Points = useMemo(
    () => previewPoints ?? detailPoints(selected),
    [previewPoints, selected],
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <TourMap
        ref={mapRef}
        toursSourceRef={toursSourceRef}
        styleIndex={styleIndex}
        overlays={overlays}
        tours={features}
        lines={lines}
        points={points}
        dimTrails={mode === 'draw'}
        drawing={mode === 'draw'}
        padding={padding}
        initialCenter={SWITZERLAND_CENTER}
        initialZoom={SWITZERLAND_ZOOM}
        onPress={(lngLat, point) => void onPress(lngLat, point)}
        onRegionDidChange={(center, zoom, bounds) =>
          useMapStore.getState().setView(center, zoom, bounds)
        }
      >
        <TrackHandles />
      </TourMap>
      {mode === 'browse' ? (
        <>
          <SafeAreaView
            edges={['bottom', 'left', 'right']}
            style={styles.row}
            pointerEvents="box-none"
          >
            <GlassCircleButton
              label={t('map.search.title')}
              hint={t('map.a11y.searchHint')}
              icon="search"
              onPress={() => router.push('/search')}
            />
            <GlassCapsule
              label={t('map.actionBar.myTours')}
              items={[
                {
                  id: 'tours',
                  label: t('map.actionBar.myTours'),
                  hint: t('map.a11y.toursHint'),
                  icon: 'location_on',
                  onPress: () => router.push('/tours'),
                },
                {
                  id: 'add',
                  label: t('map.actionBar.addTourAriaLabel'),
                  hint: t('map.a11y.addHint'),
                  icon: 'add_location_alt',
                  iconOnly: true,
                  onPress: () => router.push('/plan'),
                },
              ]}
            />
            <GlassCircleButton
              label={t('map.overlay.mapLayers')}
              hint={t('map.a11y.layersHint')}
              icon="layers"
              onPress={() => router.push('/map-layers')}
            />
          </SafeAreaView>
          {children}
        </>
      ) : null}
    </View>
  );
}

/** Within a finger's reach of a line's point or leg dot (`TrackHandles`, 44 pt targets). */
function onHandle(lngLat: LngLat): boolean {
  const { editHandles, zoom } = useMapStore.getState();
  if (!editHandles) return false;
  const z = zoom ?? 13;
  const reach = 22 * metersPerPixel(lngLat[1], z);
  const spots = [
    ...editHandles.points.map((p) => p.at),
    ...editHandles.legs.flatMap((leg) => (leg.length > 1 ? [legHandle(leg, z)] : [])),
  ].filter((spot): spot is LngLat => spot !== null);
  return spots.some((spot) => haversineMeters(spot, lngLat) < reach);
}

/** The box around these points; null without any. */
function boxOf(points: LngLat[]): [LngLat, LngLat] | null {
  if (!points.length) return null;
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

/** A short tour framed no closer than about a kilometre across (the camera has no zoom cap). */
const MIN_SPAN = 0.01;
function widened([[west, south], [east, north]]: [LngLat, LngLat]): [LngLat, LngLat] {
  const dLng = Math.max(0, MIN_SPAN * 1.5 - (east - west)) / 2;
  const dLat = Math.max(0, MIN_SPAN - (north - south)) / 2;
  return [
    [west - dLng, south - dLat],
    [east + dLng, north + dLat],
  ];
}

/**
 * Whether the box lies in the part of the map the sheet leaves visible (`covered`: its share),
 * clear of the edges by a tenth, where a marker or its name would be cut.
 */
function inView([[west, south], [east, north]]: [LngLat, LngLat], covered: number): boolean {
  const shown = useMapStore.getState().bounds;
  if (!shown) return false;
  const [w, s, e, n] = boundsAboveSheet(shown, covered);
  const [dx, dy] = [(e - w) / 10, (n - s) / 10];
  return west >= w + dx && east <= e - dx && south >= s + dy && north <= n - dy;
}

/** The lookup sheet's routes: all faint while listed, the chosen one in full on a white casing. */
function highlightLines(highlight: MapState['trailHighlight']): Lines['features'] {
  if (!highlight) return [];
  const { trails, selectedId } = highlight;
  const shown = selectedId ? trails.filter((trail) => trail.id === selectedId) : trails;
  return shown.flatMap((trail) =>
    trail.lines.map((coordinates) => ({
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates },
      properties: selectedId
        ? { color: color.trailHighlight, width: 5, casing: true }
        : { color: color.trailHighlight, width: 4, opacity: 0.55 },
    })),
  );
}

function detailPoints(tour: Tour | null): Points {
  const features: Points['features'] = [];
  if (tour?.startPoint) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [tour.startPoint.lng, tour.startPoint.lat] },
      properties: { kind: 'start', ...(tour.startPointName ? { label: tour.startPointName } : {}) },
    });
  }
  if (tour?.endPoint) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [tour.endPoint.lng, tour.endPoint.lat] },
      properties: { kind: 'end', ...(tour.endPointName ? { label: tour.endPointName } : {}) },
    });
  }
  return { type: 'FeatureCollection', features };
}

/**
 * The open tour's lines: its GPX in the type's darker colour (gpx-tracks), else a dashed
 * connector start → goal → end (gpx-tracks "Direction connector for tours without a track").
 */
function useSelectedLines(tour: Tour | null): Lines {
  const [track, setTrack] = useState<{ id: string; lines: GeoJSON.Position[][] } | null>(null);
  useEffect(() => {
    if (!tour?.gpxFilepath) return;
    let alive = true;
    void loadGpxTrack({ id: tour.id, gpxFilepath: tour.gpxFilepath }).then((geojson) => {
      if (alive && geojson) setTrack({ id: tour.id, lines: trackLines(geojson) });
    });
    return () => {
      alive = false;
    };
  }, [tour?.id, tour?.gpxFilepath]);

  if (!tour) return noLines;
  const color = tour.tourTypes[0] ? TOUR_TYPE_TRACK_COLORS[tour.tourTypes[0]] : '#334155';
  if (tour.gpxFilepath && track?.id === tour.id) {
    return {
      type: 'FeatureCollection',
      features: track.lines.map((coordinates) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: { color, width: 4, casing: true },
      })),
    };
  }
  const path = [tour.startPoint, tour.goal, tour.endPoint]
    .filter(Boolean)
    .map((p) => [p!.lng, p!.lat]);
  if (path.length < 2) return noLines;
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: path },
        properties: { color, width: 3, dashed: true },
      },
    ],
  };
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
});
