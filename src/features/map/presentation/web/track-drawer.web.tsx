import {
  LngLatBounds,
  type Map as MapLibreMap,
  type MapMouseEvent,
  type MapTouchEvent,
  type Point,
} from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { usePace } from '@/core/web/use-pace.web';
import type { DrawnTrack } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { snapNetworkFor } from '@/features/map/domain/snap-network';
import type { TourType } from '@/features/tours/data/models/tour-type';
import { tourMinutes } from '@/features/tours/domain/route-metrics';

import { isBoundsVisible } from './frame-tour.web';
import { useMapStore } from './map-store.web';
import { createTrackDrawLayer } from './track-draw-layer.web';
import { TrackDrawPanel } from './track-draw-panel.web';
import { isGap, legHandle, skiTilesTemplate, tapSnapM } from './use-leg-router.web';
import { useTrackDrawing } from './use-track-drawing.web';

const coarse = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/**
 * Draw a track on the map the way the swisstopo app does: a tap sets a point and the line runs
 * there along the trails the map shows; a point can be dragged, a tap on the start closes a loop.
 * The map stays free to pan and zoom between taps. A tour's route (a seed with its `goal`) opens
 * with its start, goal and end as the drawing's first points; the page draws their markers from
 * `live`, so they move with the drawing.
 */
export function TrackDrawer({
  map,
  seed,
  tourTypes,
  onDone,
  onCancel,
  onLive,
}: {
  map: MapLibreMap | null;
  /** The track to go on from (the form's current one, or the route's stops to join), or null for a new one. */
  seed: DrawnTrack | null;
  /** The form's activities: with both trail layers shown they pick which one the line follows. */
  tourTypes: readonly TourType[];
  onDone: (track: DrawnTrack) => void;
  onCancel: () => void;
  onLive: (track: DrawnTrack) => void;
}) {
  'use no memo';
  const activeOverlays = useMapStore((s) => s.activeOverlays);
  const toggleOverlay = useMapStore((s) => s.toggleOverlay);
  const pace = usePace();
  const network = snapNetworkFor(activeOverlays, tourTypes);
  const byActivity = activeOverlays.length > 1;
  const latest = useRef({ network, map });
  latest.current = { network, map };

  const drawing = useTrackDrawing({
    seed,
    network: () => latest.current.network,
    skiTemplate: () => skiTilesTemplate(latest.current.map),
  });
  const shown = drawing.shown;
  const track = drawing.track;
  /** A leg that found no way goes straight: the panel says so, as the route step does. */
  const gap = track.legs.some(isGap);
  useEffect(() => void onLive(shown), [shown]);

  // The time as the saved tour will show it: the activity's way of moving at the user's pace.
  const minutes = tourMinutes(drawing.metrics, { tourTypes }, pace);

  // The map's zoom, for the handles: a leg too short on screen has none, it would hide its points.
  const zoom = useRef(map?.getZoom() ?? 0);
  const handles = () =>
    drawing.handles.map((_, i) => legHandle(drawing.shown.legs[i]!, zoom.current));

  const layer = useRef<ReturnType<typeof createTrackDrawLayer> | null>(null);
  useEffect(
    () => void layer.current?.update(shown, drawing.queued, handles()),
    [shown, drawing.queued],
  );

  useEffect(() => {
    if (!map) return;
    const snapRadiusM = (lat: number) => tapSnapM(lat, map.getZoom(), coarse());
    const onZoom = () => {
      zoom.current = map.getZoom();
      layer.current?.update(drawing.shown, drawing.queued, handles());
    };

    /** The point (or else the leg handle) under `at`, within fingertip reach. */
    function grabAt(at: Point): { index: number; insert: boolean } | null {
      const reach = coarse() ? 24 : 12;
      const nearest = (spots: readonly (LngLat | null)[]) => {
        let best = -1;
        let bestDistance = reach;
        spots.forEach((p, i) => {
          const d = p ? map!.project(p).dist(at) : Infinity;
          if (d <= bestDistance) {
            best = i;
            bestDistance = d;
          }
        });
        return best;
      };
      const point = nearest(drawing.track.points);
      if (point >= 0) return { index: point, insert: false };
      const handle = nearest(handles());
      return handle >= 0 ? { index: handle, insert: true } : null;
    }

    const lngLat = (e: MapMouseEvent | MapTouchEvent): LngLat => [e.lngLat.lng, e.lngLat.lat];

    function onClick(e: MapMouseEvent) {
      const hit = grabAt(e.point);
      const { points } = drawing.track;
      // A tap on the start closes the loop; on any other point or handle it was a grab, not a new point.
      if (hit && !hit.insert && hit.index === 0 && points.length > 1)
        drawing.add(points[0]!, snapRadiusM(points[0]![1]));
      else if (!hit) drawing.add(lngLat(e), snapRadiusM(e.lngLat.lat));
    }

    let drag: { index: number; insert: boolean; from: Point; to: LngLat | null } | null = null;

    function onPress(e: MapMouseEvent | MapTouchEvent) {
      if ('touches' in e.originalEvent && e.originalEvent.touches.length > 1) return;
      const hit = grabAt(e.point);
      if (!hit || drawing.busy) return;
      // Holds the map still: this gesture moves the point, not the map.
      e.preventDefault();
      drag = { ...hit, from: e.point, to: null };
    }

    function onMove(e: MapMouseEvent | MapTouchEvent) {
      if (!drag) {
        if (!coarse()) map!.getCanvas().style.cursor = grabAt(e.point) ? 'grab' : 'crosshair';
        return;
      }
      // Under 4 px it is a tap on the point, not a drag.
      if (!drag.to && e.point.dist(drag.from) < 4) return;
      drag.to = lngLat(e);
      drawing.drag(drag.index, drag.to, drag.insert);
    }

    function onRelease() {
      if (drag?.to && drag.insert) drawing.dropInsert(drag.index, drag.to, snapRadiusM(drag.to[1]));
      else if (drag?.to) drawing.drop(drag.index, drag.to, snapRadiusM(drag.to[1]));
      drag = null;
    }

    layer.current = createTrackDrawLayer(map, 'track-draw');
    layer.current.setup();
    layer.current.update(drawing.shown, drawing.queued, handles());
    map.on('zoom', onZoom);
    // Double-tap zoom would read as two new points.
    map.doubleClickZoom.disable();
    map.getContainer().classList.add('track-drawing');
    if (!coarse()) map.getCanvas().style.cursor = 'crosshair';
    map.on('click', onClick);
    map.on('mousedown', onPress);
    map.on('touchstart', onPress);
    map.on('mousemove', onMove);
    map.on('touchmove', onMove);
    map.on('mouseup', onRelease);
    map.on('touchend', onRelease);
    map.on('touchcancel', onRelease);
    drawing.start();

    // A track to go on from is framed above the panel, unless it already shows there.
    const line = seed?.legs.flat() ?? [];
    if (line.length > 1) {
      const bounds = line.reduce((b, p) => b.extend(p), new LngLatBounds(line[0], line[0]));
      if (!isBoundsVisible(map, bounds, { bottom: 300 }))
        map.fitBounds(bounds, {
          padding: { top: 60, left: 40, right: 40, bottom: 320 },
          maxZoom: 15,
        });
    }

    return () => {
      map.off('click', onClick);
      map.off('mousedown', onPress);
      map.off('touchstart', onPress);
      map.off('mousemove', onMove);
      map.off('touchmove', onMove);
      map.off('mouseup', onRelease);
      map.off('touchend', onRelease);
      map.off('touchcancel', onRelease);
      map.off('zoom', onZoom);
      map.doubleClickZoom.enable();
      map.getContainer().classList.remove('track-drawing');
      map.getCanvas().style.cursor = '';
      layer.current?.remove();
      layer.current = null;
    };
  }, []);

  return createPortal(
    <TrackDrawPanel
      overlays={activeOverlays}
      network={network}
      byActivity={byActivity}
      issue={drawing.issue}
      gap={gap}
      points={track.points.length}
      metrics={drawing.metrics}
      minutes={minutes}
      profile={drawing.profile}
      busy={drawing.busy}
      canUndo={drawing.canUndo}
      canRedo={drawing.canRedo}
      closed={drawing.closed}
      onToggleOverlay={toggleOverlay}
      onUndo={drawing.undo}
      onRedo={drawing.redo}
      onReturnToStart={drawing.returnToStart}
      onCancel={onCancel}
      onDone={() => onDone(drawing.track)}
    />,
    document.body,
  );
}
