import type { Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useState } from 'react';

import { classes } from '@/core/web/classes';

import type { Bbox } from './offline-map-store.web';
import styles from './offline-region-outline.module.css';

const c = classes(styles);

/**
 * Read-only twin of OfflineRegionDraw's rectangle: the confirmed download extent while the
 * download sheet is open, re-projected on every map move so it stays pinned to the ground.
 */
export function OfflineRegionOutline({ map, bbox }: { map: MapLibreMap | null; bbox: Bbox }) {
  const [rect, setRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!map) return;
    // North (maxLat) is up, the smaller y: the NW corner is top-left.
    const sync = () => {
      const topLeft = map.project([bbox[0], bbox[3]]);
      const bottomRight = map.project([bbox[2], bbox[1]]);
      setRect({
        left: topLeft.x,
        top: topLeft.y,
        width: bottomRight.x - topLeft.x,
        height: bottomRight.y - topLeft.y,
      });
    };
    sync();
    map.on('move', sync);
    return () => void map.off('move', sync);
  }, [map, bbox]);

  if (!rect) return null;
  return (
    <div
      className={c('outline')}
      style={{
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      }}
    />
  );
}
