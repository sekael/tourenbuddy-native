import { LngLat, type FlyToOptions, type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { Crosshair } from '@/core/web/crosshair.web';
import { SearchInput, type SearchInputHandle } from '@/core/web/search-input.web';
import { Transition } from '@/core/web/transition.web';
import { useIsTouch, useMediaQuery } from '@/core/web/use-media-query.web';
import { useVisualViewportTop } from '@/core/web/use-visual-viewport-top.web';
import type {
  LocationResult,
  PickRole,
} from '@/features/map/data/services/swisstopo-search-service';

import { FLIGHT_SPEED } from './frame-tour.web';
import styles from './location-picker.module.css';
import { LocationSearchResults } from './location-search-results.web';
import { useLocationSearch } from './use-location-search.web';

const c = classes(styles);

/** A confirm this close to the chosen result keeps the result's name (touch drift). */
const NAME_RADIUS_M = 50;

/**
 * Where the crosshair points: the canvas's visual centre. Not `map.getCenter()`, which is the
 * padded viewport's centre (a framed tour leaves padding set).
 */
function getCrosshairCoordinates(map: MapLibreMap) {
  const canvas = map.getCanvas();
  return map.unproject([canvas.clientWidth / 2, canvas.clientHeight / 2]);
}

/**
 * The PWA's crosshair picker: the point under the crosshair, or a place found by search. Results,
 * search field and actions share one bottom dock in thumb reach; while the user searches on a
 * touch screen the field moves to the visible top with the results below it.
 */
export function LocationPicker({
  map,
  actionsBottom,
  role,
  hint,
  onConfirm,
  onCancel,
  onSearching,
}: {
  map: MapLibreMap | null;
  actionsBottom?: number;
  role?: PickRole;
  hint?: string;
  onConfirm: (location: { lng: number; lat: number; name?: string }) => void;
  onCancel: () => void;
  onSearching?: (active: boolean) => void;
}) {
  'use no memo';
  const { t, i18n } = useTranslation('web');
  const online = useStore(connectivity, (s) => s.online);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const searchInput = useRef<SearchInputHandle>(null);
  const { state: search, take } = useLocationSearch({
    locale: () => i18n.language,
    role: () => role,
    origin: () => map && { center: getCrosshairCoordinates(map), zoom: map.getZoom() },
  });

  const isTouch = useIsTouch();
  const [focused, setFocused] = useState(false);
  const searching = isTouch && (focused || search.listOpen);
  useEffect(() => void onSearching?.(searching), [searching]);
  const viewportTop = useVisualViewportTop();
  const dockBottom =
    actionsBottom != null ? `${actionsBottom}px` : 'calc(var(--spacing-lg) + var(--safe-bottom))';

  // Bottom toasts rise above the hint, search and actions; searching, the dock is at the top.
  const stack = useRef<HTMLDivElement>(null);
  const [stackHeight, setStackHeight] = useState(0);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setStackHeight(entry!.borderBoxSize[0]!.blockSize),
    );
    observer.observe(stack.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const root = document.documentElement.style;
    if (searching) root.removeProperty('--dock-inset');
    else root.setProperty('--dock-inset', `calc(${stackHeight}px + ${dockBottom})`);
  }, [searching, stackHeight, dockBottom]);
  useEffect(() => () => void document.documentElement.style.removeProperty('--dock-inset'), []);

  function closeList() {
    search.listOpen = false;
    searchInput.current?.blur();
  }

  // The flight to the chosen result: the tap that chose it also closes the keyboard, which resizes
  // the map mid-flight on phones; a resize during the flight re-issues it until the user takes the map.
  const flight = useRef<FlyToOptions | null>(null);
  // maplibre 6 dropped `isEasing()`: a flight still set and the map moving is the same test.
  const reaim = () => {
    if (flight.current && map?.isMoving()) map.flyTo(flight.current);
  };
  const releaseMap = () => {
    flight.current = null;
    closeList();
  };

  function choose(result: LocationResult | undefined) {
    if (!result || !map) return;
    take(result);
    closeList();
    // Zero padding: a framed tour leaves padding set, which would park the result off-crosshair.
    const camera = {
      center: [result.lng, result.lat] as [number, number],
      zoom: result.zoom,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      speed: FLIGHT_SPEED,
    };
    if (reducedMotion) {
      map.jumpTo(camera);
      return;
    }
    flight.current = camera;
    map.flyTo(camera);
  }

  // Touching, dragging or zooming the map hands focus (and the camera) back to the map.
  useEffect(() => {
    if (!map) return;
    const events = ['mousedown', 'touchstart', 'wheel'] as const;
    events.forEach((event) => map.on(event, releaseMap));
    map.on('resize', reaim);
    return () => {
      events.forEach((event) => map.off(event, releaseMap));
      map.off('resize', reaim);
    };
  }, [map]);

  function handleConfirm() {
    if (!map) return;
    const chosen = search.chosen;
    // Still flying to the chosen result: the result is the pick, not the crosshair en route.
    if (chosen && flight.current && map.isMoving()) {
      onConfirm({ lng: chosen.lng, lat: chosen.lat, name: chosen.name });
      return;
    }
    const coords = getCrosshairCoordinates(map);
    const onResult =
      chosen &&
      new LngLat(chosen.lng, chosen.lat).distanceTo(new LngLat(coords.lng, coords.lat)) <=
        NAME_RADIUS_M;
    onConfirm(
      onResult
        ? { lng: coords.lng, lat: coords.lat, name: chosen.name }
        : { lng: coords.lng, lat: coords.lat },
    );
  }

  return (
    <div className={c('location-picker')}>
      <Crosshair />
      <div
        className={c('dock', { 'dock--searching': searching })}
        style={
          { '--dock-bottom': dockBottom, '--viewport-top': `${viewportTop}px` } as CSSProperties
        }
      >
        <Transition name="results" cls={c}>
          {online && search.listOpen && (
            <LocationSearchResults
              results={search.results}
              failed={search.failed}
              onChoose={choose}
            />
          )}
        </Transition>
        <div ref={stack} className={c('stack')}>
          {hint && !searching && <p className={c('hint')}>{hint}</p>}
          {online && (
            <SearchInput
              ref={searchInput}
              value={search.query}
              onChange={(q) => (search.query = q)}
              className={c('search-field')}
              placeholder={
                role === 'start' || role === 'end'
                  ? t('tours.picker.search.placeholderAccess')
                  : t('tours.picker.search.placeholder')
              }
              label={t('tours.picker.search.label')}
              onEnter={() => choose(search.results[0])}
              onEscape={closeList}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            >
              {search.query && (
                <BaseIconButton
                  name="close"
                  size="sm"
                  label={t('tours.picker.search.clear')}
                  // The tap must not blur the field, or the dock would flip under the finger.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    search.query = '';
                    searchInput.current?.focus();
                  }}
                />
              )}
            </SearchInput>
          )}
          <div className={c('actions')} style={searching ? { display: 'none' } : undefined}>
            <BaseButton variant="secondary" className={c('on-map')} onClick={onCancel}>
              {t('tours.picker.cancelBtn')}
            </BaseButton>
            <BaseButton variant="primary" data-testid="picker-confirm" onClick={handleConfirm}>
              {t('tours.picker.confirmBtn')}
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  );
}
