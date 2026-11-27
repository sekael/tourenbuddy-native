import 'maplibre-gl/dist/maplibre-gl.css';

import * as maplibregl from 'maplibre-gl';
import type { LngLat, Map as MapLibreMap, PaddingOptions, Point } from 'maplibre-gl';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import { SWISSTOPO_STYLES } from '@/features/map/data/swisstopo-styles';
import { TRAIL_OVERLAYS } from '@/features/map/data/trail-overlays';
import { keptInFrame } from '@/features/map/domain/camera-flight';
import { toursOnMap } from '@/features/map/domain/tours-on-map';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import type { Tour } from '@/features/tours/domain/entities/tour';
import {
  outingChains as outingChainsOf,
  outingKey,
  outingSegments,
} from '@/features/tours/domain/outing';
import {
  draftStageMarkers,
  outingDetailMarkers,
  tourDetailMarkers,
} from '@/features/tours/domain/tour-detail-markers';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import { createGpxTrackLayer } from './gpx-track-layer.web';
import { useMapStore } from './map-store.web';
import {
  DETAIL_CIRCLE_LAYER_ID,
  TOUR_LAYER_IDS,
  createToursMarkerLayer,
} from './tours-marker-layer.web';
import styles from './tourenbuddy-map.module.css';
import { createTrackDrawLayer } from './track-draw-layer.web';
import { createTrailLayers } from './trail-layers.web';

const c = classes(styles);

// GL JS 6 is an ES module that finds its worker next to itself; Metro bundles it elsewhere, so
// `postinstall` copies the worker into `public/`.
maplibregl.setWorkerUrl(`/maplibre-gl-worker.mjs?v=${maplibregl.getVersion()}`);

/**
 * The PWA's map (`tourenbuddy-map.vue` there): Swisstopo base map, tour markers and clusters, the
 * open tour's or outing's tracks and points, the draft being created, trail overlays. The parent
 * gets the MapLibre instance through `onMap`.
 */
export function TourenbuddyMap({
  covered,
  listedTourIds,
  onTourClicked,
  onMapBackgroundClick,
  onMap,
}: {
  /** The map area an open drawer or sheet covers: cluster taps frame beside it. */
  covered?: Partial<PaddingOptions>;
  /** The tours a narrowed tour list shows: only those get markers. Null/absent = all. */
  listedTourIds?: Set<string> | null;
  onTourClicked?: (tourId: string) => void;
  onMapBackgroundClick?: (tap: { point: Point; lngLat: LngLat }) => void;
  onMap?: (map: MapLibreMap | null) => void;
}) {
  'use no memo';
  const { t, i18n } = useTranslation('web');
  const locale = i18n.language;
  const { formatDateRange, formatElevation } = useFormatter();

  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const groupIdByTourId = useTourLinksStore((s) => s.groupIdByTourId);
  const currentStyleIndex = useMapStore((s) => s.currentStyleIndex);
  const selectedTourId = useMapStore((s) => s.selectedTourId);
  const selectedOutingKey = useMapStore((s) => s.selectedOutingKey);
  const previewGoal = useMapStore((s) => s.previewGoal);
  const previewTourTypes = useMapStore((s) => s.previewTourTypes);
  const previewStart = useMapStore((s) => s.previewStart);
  const previewEnd = useMapStore((s) => s.previewEnd);
  const previewTrack = useMapStore((s) => s.previewTrack);
  const trackCursor = useMapStore((s) => s.trackCursor);
  const previewStages = useMapStore((s) => s.previewStages);
  const isDrawingTrack = useMapStore((s) => s.isDrawingTrack);
  const activeOverlays = useMapStore((s) => s.activeOverlays);
  const trailCard = useMapStore((s) => s.trailCard);

  const container = useRef<HTMLDivElement>(null);
  const m = useRef({
    map: null as MapLibreMap | null,
    markerLayer: null as ReturnType<typeof createToursMarkerLayer> | null,
    gpxLayer: null as ReturnType<typeof createGpxTrackLayer> | null,
    draftTrackLayer: null as ReturnType<typeof createTrackDrawLayer> | null,
    trailLayers: null as ReturnType<typeof createTrailLayers> | null,
    drawnScene: null as string | null,
    thumbnails: [] as HTMLImageElement[],
    cursor: null as maplibregl.Marker | null,
  }).current;

  const linkedTourIds = useMemo(() => new Set(groupIdByTourId.keys()), [groupIdByTourId]);
  const mapTours = useMemo(
    () => toursOnMap(tours, friendTours, selectedTourId, listedTourIds ?? null),
    [tours, friendTours, selectedTourId, listedTourIds],
  );
  const selectedTour = mapTours.find((x) => x.id === selectedTourId) ?? null;
  const focusSegments = useMemo(
    () => outingSegments(mapTours, selectedOutingKey),
    [mapTours, selectedOutingKey],
  );
  const focusSegmentIds = useMemo(() => focusSegments.map((x) => x.id), [focusSegments]);
  /** A tour being created, with nothing open: the map shows its stages. */
  const creating = !selectedTour && focusSegments.length === 0 && previewStages.length > 0;
  const draftTours = useMemo(
    () =>
      previewStages
        .filter((s) => s.goal && !s.track?.length)
        .map((s, i) => ({ ...s, id: `draft-${i}`, gpxFilepath: null }) as unknown as Tour),
    [previewStages],
  );
  const trackTours = useMemo(() => {
    if (focusSegments.length > 0) return focusSegments;
    if (selectedTour) return [selectedTour];
    return creating ? draftTours : [];
  }, [focusSegments, selectedTour, creating, draftTours]);
  const previewGoals = useMemo(
    () =>
      creating
        ? previewStages.flatMap((s) =>
            s.goal
              ? [
                  {
                    goal: s.goal,
                    tourTypes: s.tourTypes,
                    label: s.label ?? t('tours.form.goalLabel'),
                  },
                ]
              : [],
          )
        : previewGoal
          ? [{ goal: previewGoal, tourTypes: previewTourTypes ?? [] }]
          : [],
    [creating, previewStages, previewGoal, previewTourTypes, locale],
  );
  // While a selected tour's types are edited, its goal recolors from a copy carrying them.
  const renderedTours = useMemo(() => {
    if (previewTourTypes === null || selectedTourId === null) return mapTours;
    return mapTours.map((x) =>
      x.id === selectedTourId ? { ...x, tourTypes: previewTourTypes } : x,
    );
  }, [mapTours, previewTourTypes, selectedTourId]);
  const detailMarkers = useMemo(() => {
    if (creating) return draftStageMarkers(previewStages);
    if (!selectedTour && focusSegments.length > 0 && !previewStart && !previewEnd)
      return outingDetailMarkers(focusSegments);
    return tourDetailMarkers({
      tourTypes: previewTourTypes ?? selectedTour?.tourTypes ?? [],
      start: { saved: selectedTour?.startPoint ?? null, draft: previewStart },
      end: { saved: selectedTour?.endPoint ?? null, draft: previewEnd },
    });
  }, [
    creating,
    previewStages,
    selectedTour,
    focusSegments,
    previewStart,
    previewEnd,
    previewTourTypes,
  ]);
  const stageOf = useMemo(() => {
    const stages = new Map<string, { n: number; total: number }>();
    for (const key of new Set(mapTours.map(outingKey).filter((k) => k !== null))) {
      const segments = outingSegments(mapTours, key);
      segments.forEach((s, i) => stages.set(s.id, { n: i + 1, total: segments.length }));
    }
    return stages;
  }, [mapTours]);
  const outingChains = useMemo(
    () =>
      selectedTour || focusSegments.length > 0 ? [] : outingChainsOf(mapTours, selectedOutingKey),
    [selectedTour, focusSegments, mapTours, selectedOutingKey],
  );
  const detailLabels = useMemo(
    () => ({ start: t('tours.form.startPointLabel'), end: t('tours.form.endPointLabel') }),
    [locale],
  );
  /** Who has the map: the open tour, else the open outing's segments. A change swaps the scene. */
  const scene = `${selectedTour?.id ?? ''}/${focusSegmentIds.join()}`;
  const badgeLang = locale.split('-')[0]!;

  /** Label lines: the name, then elevation · date, or "no date" / "done". */
  function describeTour(tour: Tour) {
    const thisYear = new Date().getFullYear();
    const start = tour.plannedDate;
    const status = tour.completed
      ? t('map.marker.done')
      : start
        ? formatDateRange(start, tour.endDate ?? start, {
            day: 'numeric',
            month: 'short',
            ...(start.getFullYear() !== thisYear ? { year: 'numeric' } : {}),
          })
        : t('map.marker.noDate');
    const stage = latest.current.stageOf.get(tour.id);
    return {
      name: tour.name || t('tours.infoSheet.unnamedTour'),
      sub: [
        stage ? t('map.marker.stage', stage) : null,
        tour.elevation ? formatElevation(tour.elevation) : null,
        status,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }

  // The latest values, for the map's own callbacks (load, style swaps, scene swaps).
  const latest = useRef({
    renderedTours,
    selectedTourId,
    linkedTourIds,
    focusSegmentIds,
    detailMarkers,
    detailLabels,
    outingChains,
    trackTours,
    creating,
    previewGoals,
    previewStages,
    previewTrack,
    isDrawingTrack,
    activeOverlays,
    badgeLang,
    trailCard,
    scene,
    stageOf,
    covered,
    describeTour,
    onTourClicked,
    onMapBackgroundClick,
  });
  latest.current = {
    renderedTours,
    selectedTourId,
    linkedTourIds,
    focusSegmentIds,
    detailMarkers,
    detailLabels,
    outingChains,
    trackTours,
    creating,
    previewGoals,
    previewStages,
    previewTrack,
    isDrawingTrack,
    activeOverlays,
    badgeLang,
    trailCard,
    scene,
    stageOf,
    covered,
    describeTour,
    onTourClicked,
    onMapBackgroundClick,
  };

  function drawScene() {
    const l = latest.current;
    m.drawnScene = l.scene;
    m.markerLayer?.updateTours(
      l.renderedTours,
      l.selectedTourId,
      l.linkedTourIds,
      l.focusSegmentIds,
    );
    m.markerLayer?.updateDetailMarkers(l.detailMarkers, l.detailLabels);
    m.markerLayer?.updateOutingChains(l.outingChains);
    void m.gpxLayer?.updateTracks(l.trackTours, { gaps: !l.creating });
  }

  // A drawing, or a track drawn or picked but not saved yet, stands in for the tour's saved one; a
  // tour being created shows its stages' tracks, a trip's other days fainter.
  function showDraftTrack() {
    const l = latest.current;
    const stageTracks = (active: boolean) =>
      l.previewStages.flatMap((s) =>
        s.track?.length && (s.active ?? true) === active ? [s.track] : [],
      );
    const lines = l.creating
      ? stageTracks(true)
      : l.isDrawingTrack
        ? []
        : l.previewTrack?.length
          ? [l.previewTrack]
          : [];
    m.draftTrackLayer?.update(
      { points: [], legs: lines },
      [],
      [],
      l.creating ? stageTracks(false) : [],
    );
    m.gpxLayer?.setVisible(!l.isDrawingTrack && (l.creating || l.previewTrack === null));
    m.trailLayers?.setDimmed(l.isDrawingTrack);
  }

  const trailLayerState = () => ({
    active: latest.current.activeOverlays,
    lang: latest.current.badgeLang,
    card: latest.current.trailCard,
  });

  /** Swisstopo's landmark summits look like tour markers: the plain summit symbol instead. */
  function calmLandmarkPeaks(map: MapLibreMap) {
    if (!map.getLayer('peak_lm')) return;
    map.setLayoutProperty('peak_lm', 'icon-image', 'mountain');
    map.setLayoutProperty('peak_lm', 'icon-size', [
      'interpolate',
      ['linear'],
      ['zoom'],
      13,
      0.25,
      18,
      0.55,
    ]);
  }

  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: SWISSTOPO_STYLES[0]!.style,
      center: [8.2, 46.8],
      zoom: 8,
      minZoom: 5.8,
      renderWorldCopies: false,
    });
    m.map = map;
    onMap?.(map);
    // Resize the canvas when the visual viewport changes (keyboard, iOS dynamic viewport).
    const onVisualViewportResize = () => map.resize();
    window.visualViewport?.addEventListener('resize', onVisualViewportResize);

    map.on('load', async () => {
      // Layer previews decoded once, so the layers panel opens with its thumbnails painted.
      m.thumbnails.push(
        ...[...SWISSTOPO_STYLES, ...TRAIL_OVERLAYS].map(({ thumbnail }) => {
          const img = new Image();
          img.src = thumbnail;
          img.decode().catch(() => {});
          return img;
        }),
      );
      calmLandmarkPeaks(map);
      // First: the overlay stack sits below everything added after it.
      m.trailLayers = createTrailLayers(map);
      m.trailLayers.setup(trailLayerState());
      m.markerLayer = createToursMarkerLayer(
        map,
        (tourId) => latest.current.onTourClicked?.(tourId),
        (count) => t('map.cluster.label', { count }),
        {
          describeTour: (tour) => latest.current.describeTour(tour),
          stackTitle: (count) => t('map.marker.stackTitle', { count }),
          stackMore: (count) => t('map.marker.stackMore', { count }),
          clusterSummary: ({ total, planned, undated, done }) =>
            [
              t('map.cluster.label', { count: total }),
              ...(
                [
                  ['planned', planned],
                  ['undated', undated],
                  ['done', done],
                ] as const
              )
                .filter(([, count]) => count > 0)
                .map(([key, count]) => t(`map.cluster.${key}`, { count })),
            ].join(' · '),
          closeLabel: t('map.marker.close'),
        },
        () => latest.current.covered ?? {},
      );
      await m.markerLayer.setup();
      m.markerLayer.updatePreview(latest.current.previewGoals);
      m.gpxLayer = createGpxTrackLayer(map);
      m.gpxLayer.setup();
      drawScene();
      // After the scene: the line goes under the connector arrows the scene adds.
      m.draftTrackLayer = createTrackDrawLayer(map, 'track-draft', { withPoints: false });
      m.draftTrackLayer.setup();
      showDraftTrack();

      map.on('click', (e) => {
        // The detail circle too: a tap on a start/end marker is swallowed, not a background tap.
        const layers: string[] = [...TOUR_LAYER_IDS];
        if (map.getLayer(DETAIL_CIRCLE_LAYER_ID)) layers.push(DETAIL_CIRCLE_LAYER_ID);
        if (map.queryRenderedFeatures(e.point, { layers }).length === 0)
          latest.current.onMapBackgroundClick?.({ point: e.point, lngLat: e.lngLat });
      });
    });

    return () => {
      window.visualViewport?.removeEventListener('resize', onVisualViewportResize);
      m.thumbnails.length = 0;
      m.markerLayer?.cleanup();
      map.remove();
      m.map = null;
      m.markerLayer = m.gpxLayer = m.draftTrackLayer = m.trailLayers = null;
      onMap?.(null);
    };
  }, []);

  // Watchers, as in the PWA.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return;
    m.markerLayer?.swapScene(drawScene, (visible: boolean) => m.gpxLayer?.setVisible(visible));
  }, [scene]);
  const inDrawnScene = () => scene === m.drawnScene;
  useEffect(() => {
    if (inDrawnScene())
      m.markerLayer?.updateTours(renderedTours, selectedTourId, linkedTourIds, focusSegmentIds);
  }, [renderedTours, selectedTourId, linkedTourIds, focusSegmentIds, locale]);
  useEffect(() => {
    if (inDrawnScene()) void m.gpxLayer?.updateTracks(trackTours, { gaps: !creating });
  }, [trackTours]);
  useEffect(() => {
    m.markerLayer?.updatePreview(previewGoals);
  }, [previewGoals]);
  useEffect(() => {
    if (inDrawnScene()) m.markerLayer?.updateDetailMarkers(detailMarkers, detailLabels);
  }, [detailMarkers, detailLabels]);
  useEffect(() => {
    if (inDrawnScene()) m.markerLayer?.updateOutingChains(outingChains);
  }, [outingChains]);
  useEffect(() => {
    if (!first.current) showDraftTrack();
  }, [previewTrack, previewStages, creating, isDrawingTrack]);
  useEffect(() => {
    if (!first.current) m.trailLayers?.setVisible(activeOverlays);
  }, [activeOverlays]);
  // The open tour's profile points here (tour-info-extended): a dot on its track, kept in view.
  useEffect(() => {
    if (!m.map || !trackCursor) {
      m.cursor?.remove();
      m.cursor = null;
      return;
    }
    if (!m.cursor) {
      const element = document.createElement('div');
      element.className = c('track-cursor');
      element.setAttribute('aria-hidden', 'true');
      m.cursor = new maplibregl.Marker({ element, anchor: 'center' });
      m.cursor.setLngLat(trackCursor.point).addTo(m.map);
    } else m.cursor.setLngLat(trackCursor.point);
    // The activity's colour there, as on the profile.
    m.cursor.getElement().style.background = trackCursor.color;
    // Past the middle of the map beside the drawer or sheet, the map moves along with it at once,
    // just so far (the same rule as the apps').
    const map = m.map;
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const { top = 0, right = 0, bottom = 0, left = 0 } = latest.current.covered ?? {};
    const shown = map.getBounds();
    const pan = keptInFrame(
      [shown.getWest(), shown.getSouth(), shown.getEast(), shown.getNorth()],
      { width, height },
      { top, right, bottom, left },
      trackCursor.point,
    );
    if (pan) map.panBy(pan.by, { duration: 0 });
  }, [trackCursor]);
  useEffect(() => {
    if (!first.current) m.trailLayers?.setHighlight(trailCard);
  }, [trailCard]);
  useEffect(() => {
    if (!first.current) m.trailLayers?.setLang(badgeLang);
  }, [badgeLang]);
  useEffect(() => {
    const map = m.map;
    const style = SWISSTOPO_STYLES[currentStyleIndex];
    if (first.current || !map || !style) return;
    m.markerLayer?.cleanup();
    map.setStyle(style.style);
    map.once('style.load', async () => {
      calmLandmarkPeaks(map);
      m.trailLayers?.setup(trailLayerState());
      await m.markerLayer?.setup();
      m.markerLayer?.updatePreview(latest.current.previewGoals);
      m.gpxLayer?.setup();
      drawScene();
      m.draftTrackLayer?.setup();
      showDraftTrack();
    });
  }, [currentStyleIndex]);
  useEffect(() => {
    first.current = false;
  }, []);

  return <div ref={container} className={c('map-container')} />;
}
