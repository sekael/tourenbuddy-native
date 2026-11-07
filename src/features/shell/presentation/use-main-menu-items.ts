import { type Href, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import type { FloatingMenuItem } from '@/core/adaptive/floating-menu';
import type { IconName } from '@/core/adaptive/icons';

export type ShellTab = 'map' | 'calendar';

type Entry = { id: string; label: string; icon: IconName; href: Href; mapOnly?: boolean };

/**
 * The app menu, nearest the thumb first, with the Vue app's entries: the map's own (offline maps,
 * map layers) only on the Map tab. Each entry opens its feature as a sheet.
 */
export function useMainMenuItems(tab: ShellTab): FloatingMenuItem[] {
  const { t } = useTranslation();

  const entries: Entry[] = [
    { id: 'inbox', label: t('map.overlay.inbox'), icon: 'inbox', href: '/inbox' },
    { id: 'contacts', label: t('map.overlay.contacts'), icon: 'contacts', href: '/contacts' },
    { id: 'profile', label: t('map.overlay.profile'), icon: 'profile', href: '/profile' },
    {
      id: 'offline-maps',
      label: t('map.overlay.offlineMap'),
      icon: 'offline',
      href: '/offline-maps',
      mapOnly: true,
    },
    {
      id: 'map-layers',
      label: t('map.overlay.mapLayers'),
      icon: 'layers',
      href: '/map-layers',
      mapOnly: true,
    },
    { id: 'feedback', label: t('map.overlay.feedback'), icon: 'feedback', href: '/feedback' },
  ];

  return entries
    .filter((entry) => tab === 'map' || !entry.mapOnly)
    .map(({ id, label, icon, href }) => ({ id, label, icon, onPress: () => router.push(href) }));
}
