import { useEffect, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { classes } from '@/core/web/classes';
import { focusForKeyboard } from '@/core/web/keyboard-focus.web';
import { SWISSTOPO_STYLES } from '@/features/map/data/swisstopo-styles';
import { TRAIL_OVERLAYS, type TrailOverlayId } from '@/features/map/data/trail-overlays';

import { LayerTile } from './layer-tile.web';
import styles from './map-layers-panel.module.css';

const c = classes(styles);

/** Base maps (a radio group; offline disabled) and overlays (toggles) with previews. */
export function MapLayersPanel({
  currentStyleIndex,
  activeOverlays,
  onSelectStyle,
  onToggleOverlay,
  ref,
}: {
  currentStyleIndex: number;
  activeOverlays: TrailOverlayId[];
  onSelectStyle: (index: number) => void;
  onToggleOverlay: (id: TrailOverlayId) => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const { t } = useTranslation('web');
  const online = useStore(connectivity, (s) => s.online);
  const panelEl = useRef<HTMLDivElement | null>(null);
  // Keyboard users get focus on the current base map (or the first overlay offline).
  useEffect(
    () => focusForKeyboard(panelEl.current?.querySelector<HTMLElement>('button:not(:disabled)')),
    [],
  );

  function onBaseKeydown(e: KeyboardEvent<HTMLDivElement>) {
    const step = (
      { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>
    )[e.key];
    if (!step) return;
    e.preventDefault();
    const n = SWISSTOPO_STYLES.length;
    onSelectStyle((currentStyleIndex + step + n) % n);
  }

  return (
    <div
      ref={(node) => {
        panelEl.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      className={c('panel fab-glass')}
      data-tour="map-layers"
    >
      <section>
        <h3 id="map-layers-base" className={c('heading')}>
          {t('map.layers.baseMap')}
        </h3>
        {!online && <p className={c('hint')}>{t('map.layers.needsConnection')}</p>}
        <div
          className={c('tiles')}
          role="radiogroup"
          aria-labelledby="map-layers-base"
          onKeyDown={onBaseKeydown}
        >
          {SWISSTOPO_STYLES.map((style, idx) => (
            <LayerTile
              key={style.style as string}
              role="radio"
              aria-checked={currentStyleIndex === idx}
              tabIndex={currentStyleIndex === idx ? 0 : -1}
              label={t(style.labelKey as never)}
              thumbnail={style.thumbnail}
              selected={currentStyleIndex === idx}
              disabled={!online}
              onSelect={() => onSelectStyle(idx)}
            />
          ))}
        </div>
      </section>
      <section>
        <h3 className={c('heading')}>{t('map.layers.overlays.title')}</h3>
        <div className={c('tiles')}>
          {TRAIL_OVERLAYS.map((overlay) => (
            <LayerTile
              key={overlay.id}
              aria-pressed={activeOverlays.includes(overlay.id)}
              label={t(overlay.labelKey as never)}
              thumbnail={overlay.thumbnail}
              icon={overlay.icon}
              iconColor={overlay.iconColor}
              selected={activeOverlays.includes(overlay.id)}
              onSelect={() => onToggleOverlay(overlay.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
