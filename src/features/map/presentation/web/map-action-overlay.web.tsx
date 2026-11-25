import { useEffect, useImperativeHandle, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseTooltip } from '@/core/web/base-tooltip.web';
import { classes } from '@/core/web/classes';
import { Transition } from '@/core/web/transition.web';
import { usePwaUpdate } from '@/core/web/use-pwa-update.web';
import { useReactive } from '@/core/web/use-reactive.web';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useInboxAttention } from '@/features/notifications/presentation/inbox-sheet';

import styles from './map-action-overlay.module.css';
import { MapLayersPanel } from './map-layers-panel.web';
import { MapLegend } from './map-legend.web';
import { MapSpeedDialMenu, type SpeedDialMenuItem } from './map-speed-dial-menu.web';
import { useMapStore } from './map-store.web';
import { SpeedDialTrigger } from './speed-dial-trigger.web';

const c = classes(styles);

export type OverlayView = 'closed' | 'menu' | 'map-layers' | 'legend';
export type MapActionOverlayHandle = {
  isOpen: boolean;
  closeMenu: () => void;
  openMenu: () => void;
  openMapLayers: () => void;
};

/**
 * The PWA's map controls (`map-action-overlay.vue` with `use-map-overlay`): the compass, the legend
 * button, the speed-dial menu (feedback, layers, offline maps, profile, contacts, inbox) and the
 * layers panel or legend in the menu's place, all above the trigger in the thumb zone.
 */
export function MapActionOverlay({
  bearing = 0,
  overlayActive,
  onOpenProfile,
  onOpenContacts,
  onOpenFeedback,
  onOpenOfflineMap,
  onOpenInbox,
  onResetBearing,
  onDismissOverlay,
  onOpenChange,
  ref,
}: {
  bearing?: number;
  overlayActive?: boolean;
  onOpenProfile: () => void;
  onOpenContacts: () => void;
  onOpenFeedback: () => void;
  onOpenOfflineMap: () => void;
  onOpenInbox: () => void;
  onResetBearing: () => void;
  onDismissOverlay: () => void;
  /** The speed dial opened or closed: the page's bar state reads it (Vue read the exposed ref). */
  onOpenChange?: (open: boolean) => void;
  ref?: React.Ref<MapActionOverlayHandle>;
}) {
  'use no memo';
  const { t } = useTranslation('web');
  const isPickingLocation = useMapStore((s) => s.isPickingLocation);
  const isDrawingRegion = useMapStore((s) => s.isDrawingRegion);
  const currentStyleIndex = useMapStore((s) => s.currentStyleIndex);
  const activeOverlays = useMapStore((s) => s.activeOverlays);
  const incomingRequests = useFriendshipsStore((s) => s.incoming);
  const inboxCount = useInboxAttention();
  const { updateAvailable } = usePwaUpdate();
  const s = useReactive(() => ({ view: 'closed' as OverlayView }));
  const isOpen = s.view !== 'closed';
  useEffect(() => void onOpenChange?.(isOpen), [isOpen]);
  const pendingIncomingCount = incomingRequests.filter((r) => r.status === 'pending').length;

  useEffect(() => {
    if (isPickingLocation) s.view = 'closed';
  }, [isPickingLocation]);

  const menuItems: SpeedDialMenuItem[] = [
    {
      id: 'feedback',
      icon: 'feedback',
      label: t('map.overlay.feedback'),
      tooltip: t('map.overlay.feedbackTooltip'),
    },
    // Always enabled: offline only the panel's base-map section is disabled.
    { id: 'map-layers', icon: 'layers', label: t('map.overlay.mapLayers') },
    { id: 'offline-map', icon: 'download_for_offline', label: t('map.overlay.offlineMap') },
    {
      id: 'profile',
      icon: 'account_circle',
      label: t('map.overlay.profile'),
      // The tooltip is also the accessible name: the dot alone is aria-hidden.
      tooltip: updateAvailable
        ? t('map.overlay.profileUpdateAvailable')
        : t('map.overlay.profileTooltip'),
      dot: updateAvailable,
    },
    {
      id: 'contacts',
      icon: 'group',
      label: t('map.overlay.contacts'),
      // A dot, not a count: each request is already an inbox entry, counted there.
      dot: pendingIncomingCount > 0,
      tooltip: t('map.overlay.contactsTooltip'),
    },
    // Nearest the trigger: the one count the trigger mirrors.
    { id: 'inbox', icon: 'notifications', label: t('map.overlay.inbox'), badge: inboxCount },
  ];

  function onMenuSelect(id: string) {
    if (id === 'map-layers') {
      s.view = 'map-layers';
      return;
    }
    s.view = 'closed';
    (
      ({
        contacts: onOpenContacts,
        profile: onOpenProfile,
        'offline-map': onOpenOfflineMap,
        inbox: onOpenInbox,
        feedback: onOpenFeedback,
      }) as Record<string, () => void>
    )[id]?.();
  }

  // A base pick closes the panel; overlay toggles keep it open.
  function selectStyle(index: number) {
    useMapStore.getState().setStyleIndex(index);
    s.view = 'closed';
  }

  function toggleMenu() {
    if (overlayActive) {
      onDismissOverlay();
      return;
    }
    s.view = isOpen ? 'closed' : 'menu';
  }
  const closeMenu = () => (s.view = 'closed');

  /** Escape folds an open menu or panel only; an open drawer stays. */
  function onEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (isOpen) e.preventDefault();
    closeMenu();
  }

  // Imperative openers for the guided tour.
  useImperativeHandle(ref, () => ({
    isOpen: s.view !== 'closed',
    closeMenu,
    openMenu: () => {
      if (!useMapStore.getState().isPickingLocation) s.view = 'menu';
    },
    openMapLayers: () => {
      if (!useMapStore.getState().isPickingLocation) s.view = 'map-layers';
    },
  }));

  if (isPickingLocation || isDrawingRegion) return null;
  const showCompass = Math.abs(bearing) > 0.5;
  return (
    <div className={c('overlay')} onKeyDown={onEscape}>
      {isOpen && <div className={c('backdrop')} aria-hidden="true" onClick={closeMenu} />}

      {showCompass && (
        <BaseTooltip text={t('map.overlay.compassTooltip')}>
          <button type="button" className={c('compass-fab fab-glass')} onClick={onResetBearing}>
            <BaseIcon
              name="explore"
              className={c('compass-icon')}
              style={{ transform: `rotate(${-bearing}deg)` }}
            />
          </button>
        </BaseTooltip>
      )}

      {/* The legend one tap away, bottom left, in the tour bar's row. */}
      {!isOpen && !overlayActive && (
        <div className={c('legend-anchor')}>
          <BaseTooltip text={t('map.legend.open')}>
            <button
              type="button"
              className={c('legend-fab fab-glass')}
              aria-label={t('map.legend.open')}
              data-testid="legend-fab"
              onClick={() => (s.view = 'legend')}
            >
              <BaseIcon name="info" />
            </button>
          </BaseTooltip>
        </div>
      )}

      {/* The layers panel takes the menu's place, right above the trigger. */}
      <Transition name="dial" cls={c}>
        {s.view === 'menu' ? (
          <MapSpeedDialMenu key="menu" items={menuItems} onSelect={onMenuSelect} />
        ) : s.view === 'map-layers' ? (
          <MapLayersPanel
            key="map-layers"
            currentStyleIndex={currentStyleIndex}
            activeOverlays={activeOverlays}
            onSelectStyle={selectStyle}
            onToggleOverlay={(id) => useMapStore.getState().toggleOverlay(id)}
          />
        ) : s.view === 'legend' ? (
          <section
            key="legend"
            className={c('legend-panel fab-glass')}
            aria-label={t('map.legend.title')}
          >
            <h3 className={c('legend-heading')}>{t('map.legend.title')}</h3>
            <MapLegend />
          </section>
        ) : null}
      </Transition>

      <SpeedDialTrigger
        isOpen={isOpen}
        count={inboxCount}
        dot={pendingIncomingCount > 0 || updateAvailable}
        titleOpen={t('map.overlay.menuClose')}
        titleClosed={t('map.overlay.menuOpen')}
        className={c({ 'trigger--overlay-active': overlayActive })}
        onToggle={toggleMenu}
      />
    </div>
  );
}
