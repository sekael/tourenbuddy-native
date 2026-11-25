import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatBytes } from '@/core/utils/format-bytes';
import { BaseButton } from '@/core/web/base-button.web';
import { classes } from '@/core/web/classes';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useReactive } from '@/core/web/use-reactive.web';

import { useOfflineMapStore, type Bbox } from './offline-map-store.web';
import styles from './offline-region-draw.module.css';

const c = classes(styles);

type Phase = 'idle' | 'drawing' | 'done';
interface LngLat {
  lng: number;
  lat: number;
}

/** Draw the region for an offline download: two corners on desktop, a fixed frame on phones. */
export function OfflineRegionDraw({
  map,
  onConfirm,
  onCancel,
}: {
  map: MapLibreMap | null;
  onConfirm: (bbox: Bbox) => void;
  onCancel: () => void;
}) {
  'use no memo';
  const { t } = useTranslation('web');
  const estimate = useOfflineMapStore((st) => st.estimate);
  const updateEstimate = useOfflineMapStore.getState().updateEstimate;
  // Desktop = click two corners (map stays pannable); mobile = drag the map under a fixed frame.
  // Captured on mount — a mid-draw viewport flip across 600px does not rewire handlers,
  // negligible for a short-lived task overlay.
  const liveDesktop = useIsDesktop();
  const [isDesktop] = useState(liveDesktop);

  const s = useReactive(() => ({
    /** 'idle' = no corner yet · 'drawing' = first corner set, tracking cursor · 'done' = both set. */
    phase: 'idle' as Phase,
    // Desktop corners are anchored in GEO, not screen pixels, so the rectangle stays pinned to
    // the ground while the user pans/zooms the map between clicks.
    startLL: null as LngLat | null,
    curLL: null as LngLat | null,
    // Screen-pixel projection of the two corners, re-derived on every map move.
    startPx: null as { x: number; y: number } | null,
    curPx: null as { x: number; y: number } | null,
    bbox: null as Bbox | null,
    /** Mobile frame in container-local px — single source of truth for the CSS square AND its bbox. */
    frameBox: null as { left: number; top: number; side: number } | null,
  }));

  const rect =
    s.startPx && s.curPx
      ? {
          left: `${Math.min(s.startPx.x, s.curPx.x)}px`,
          top: `${Math.min(s.startPx.y, s.curPx.y)}px`,
          width: `${Math.abs(s.startPx.x - s.curPx.x)}px`,
          height: `${Math.abs(s.startPx.y - s.curPx.y)}px`,
        }
      : null;
  const frameStyle = s.frameBox
    ? {
        left: `${s.frameBox.left}px`,
        top: `${s.frameBox.top}px`,
        width: `${s.frameBox.side}px`,
        height: `${s.frameBox.side}px`,
      }
    : null;
  const hasArea =
    !!s.bbox &&
    !!s.startPx &&
    !!s.curPx &&
    Math.abs(s.startPx.x - s.curPx.x) > 4 &&
    Math.abs(s.startPx.y - s.curPx.y) > 4;
  /** Desktop needs a finished two-corner box; mobile's frame always has area. */
  const canConfirm = isDesktop ? s.phase === 'done' && hasArea : !!s.bbox;
  /** Step-appropriate title text; shows the live size estimate once a rectangle exists. */
  const displayHint = !isDesktop
    ? t('offlineMap.draw.hintMobile', { size: formatBytes(estimate) })
    : s.phase === 'idle'
      ? t('offlineMap.draw.hintStart')
      : s.phase === 'drawing' && !hasArea
        ? t('offlineMap.draw.hintExpand')
        : formatBytes(estimate);

  /** Unproject two container-pixel corners → normalized WGS84 bbox (mobile frame). */
  function bboxFrom(ax: number, ay: number, bx: number, by: number): Bbox | null {
    if (!map) return null;
    const a = map.unproject([ax, ay]);
    const b = map.unproject([bx, by]);
    return [
      Math.min(a.lng, b.lng),
      Math.min(a.lat, b.lat),
      Math.max(a.lng, b.lng),
      Math.max(a.lat, b.lat),
    ];
  }

  // --- Desktop: geo-anchored two-click, map stays interactive ---

  /** Re-project the geo corners to screen px so the drawn rectangle follows pan/zoom. */
  function reproject() {
    if (!map || !s.startLL || !s.curLL) return;
    const a = map.project(s.startLL);
    const b = map.project(s.curLL);
    s.startPx = { x: a.x, y: a.y };
    s.curPx = { x: b.x, y: b.y };
  }

  /** bbox straight from the two geo corners — independent of the current viewport. */
  function syncBbox() {
    if (!s.startLL || !s.curLL) return;
    const b: Bbox = [
      Math.min(s.startLL.lng, s.curLL.lng),
      Math.min(s.startLL.lat, s.curLL.lat),
      Math.max(s.startLL.lng, s.curLL.lng),
      Math.max(s.startLL.lat, s.curLL.lat),
    ];
    s.bbox = b;
    updateEstimate(b);
  }

  function onMapClick(e: MapMouseEvent) {
    const ll = { lng: e.lngLat.lng, lat: e.lngLat.lat };
    if (s.phase === 'idle') {
      s.startLL = ll;
      s.curLL = ll;
      s.bbox = null;
      s.phase = 'drawing';
      reproject();
    } else if (s.phase === 'drawing') {
      s.curLL = ll;
      s.phase = 'done';
      reproject();
      syncBbox();
    }
  }

  function onMapMouseMove(e: MapMouseEvent) {
    if (s.phase !== 'drawing') return;
    s.curLL = { lng: e.lngLat.lng, lat: e.lngLat.lat };
    reproject();
    syncBbox();
  }

  // --- Mobile: fixed centered frame, map pans/zooms underneath ---

  /** Recompute the centered frame's pixel rect for the current container size. */
  function updateFrame() {
    const el = map?.getContainer();
    if (!el) return;
    const { clientWidth: w, clientHeight: h } = el;
    const side = Math.min(Math.min(w, h) * 0.7, 320);
    s.frameBox = { left: (w - side) / 2, top: (h - side) / 2, side };
    syncFrameBbox();
  }

  /** bbox from the frame's fixed screen rect — runs on every map move. */
  function syncFrameBbox() {
    const f = s.frameBox;
    const b = f && bboxFrom(f.left, f.top, f.left + f.side, f.top + f.side);
    if (!b) return;
    s.bbox = b;
    updateEstimate(b);
  }

  /** Start the two-click process over (desktop). */
  function redraw() {
    s.phase = 'idle';
    s.startLL = null;
    s.curLL = null;
    s.startPx = null;
    s.curPx = null;
    s.bbox = null;
    updateEstimate(null);
  }

  function confirm() {
    if (canConfirm && s.bbox) onConfirm(s.bbox);
  }

  // Crosshair only while a corner can be placed (idle/drawing); revert to the normal navigation
  // cursor once the rectangle is finished, until a redraw.
  useEffect(() => {
    if (isDesktop && map) map.getCanvas().style.cursor = s.phase === 'done' ? '' : 'crosshair';
  }, [s.phase]);

  useEffect(() => {
    const m = map;
    if (m) {
      if (isDesktop) {
        // Map stays fully navigable; a drag pans (no 'click' fired), only a click places a
        // corner. 'move' re-pins the rectangle to the ground on pan/zoom.
        m.getCanvas().style.cursor = 'crosshair';
        m.on('click', onMapClick);
        m.on('mousemove', onMapMouseMove);
        m.on('move', reproject);
      } else {
        updateFrame();
        m.on('move', syncFrameBbox);
        m.on('resize', updateFrame);
      }
    }
    return () => {
      if (m) {
        m.getCanvas().style.cursor = '';
        m.off('click', onMapClick);
        m.off('mousemove', onMapMouseMove);
        m.off('move', reproject);
        m.off('move', syncFrameBbox);
        m.off('resize', updateFrame);
      }
      updateEstimate(null);
    };
  }, []);

  return (
    <div className={c('draw-layer')}>
      {/* Desktop: geo-anchored rectangle, drawn from two map clicks (visual only). */}
      {isDesktop && rect ? (
        <div className={c('rect')} style={rect} />
      ) : !isDesktop && frameStyle ? (
        /* Mobile: fixed frame, map pans/zooms underneath. */
        <div className={c('rect mobile-frame')} style={frameStyle} />
      ) : null}

      <div className={c('hint')}>{displayHint}</div>

      <div className={c('actions')}>
        <BaseButton variant="secondary" className={c('on-map')} onClick={onCancel}>
          {t('offlineMap.draw.cancel')}
        </BaseButton>
        {isDesktop && s.phase === 'done' && (
          <BaseButton variant="secondary" className={c('on-map')} onClick={redraw}>
            {t('offlineMap.draw.redraw')}
          </BaseButton>
        )}
        {(!isDesktop || s.phase === 'done') && (
          <BaseButton variant="primary" disabled={!canConfirm} onClick={confirm}>
            {t('offlineMap.draw.confirm')}
          </BaseButton>
        )}
      </div>
    </div>
  );
}
