import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { FloatingMenu } from '@/core/adaptive/floating-menu';

/**
 * The map's menu in the bottom-trailing corner, above the tab bar: a glass circle with the system
 * menu on iOS, a FAB menu on Android and web. It holds the Vue app's map entries, nearest the thumb
 * first, each opening as a sheet. The other tabs have no menu.
 */
export function MapMenu() {
  const { t } = useTranslation();

  return (
    <FloatingMenu
      label={t('map.overlay.menuOpen')}
      closeLabel={t('map.overlay.menuClose')}
      items={[
        {
          id: 'offline-maps',
          label: t('map.overlay.offlineMap'),
          icon: 'offline',
          onPress: () => router.push('/offline-maps'),
        },
        {
          id: 'map-layers',
          label: t('map.overlay.mapLayers'),
          icon: 'layers',
          onPress: () => router.push('/map-layers'),
        },
      ]}
    />
  );
}
