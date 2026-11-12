import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import type { IconName } from '@/core/adaptive/icons';
import { ListRow, ListSection, ToggleRow } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { connectivity } from '@/core/offline/online';
import { TRAIL_OVERLAYS } from '@/features/map/data/trail-overlays';

import { BASE_STYLES } from './map-styles';
import { useMapStore } from './stores/map-store';

/**
 * Map layers (map-layers): the base map, one of them, and the trail overlays on top, any
 * combination. Overlays need a connection unless their area is downloaded.
 */
export function MapLayersSheet() {
  const { t } = useTranslation();
  const styleIndex = useMapStore((s) => s.styleIndex);
  const overlays = useMapStore((s) => s.overlays);
  const online = useStore(connectivity, (s) => s.online);
  const store = useMapStore.getState();

  return (
    <Screen>
      <Page title={t('map.overlay.mapLayers')} onClose={() => router.back()}>
        <ListSection title={t('map.layers.baseMap')}>
          {BASE_STYLES.map((style, index) => (
            <ListRow
              key={style.labelKey}
              title={t(style.labelKey)}
              icon="map"
              checked={index === styleIndex}
              chevron={false}
              onPress={() => {
                void Haptics.selectionAsync();
                store.setStyleIndex(index);
              }}
            />
          ))}
        </ListSection>
        <ListSection
          title={t('map.layers.overlays.title')}
          footer={online ? undefined : t('map.layers.needsConnection')}
        >
          {TRAIL_OVERLAYS.map((overlay) => (
            <ToggleRow
              key={overlay.id}
              title={t(overlay.labelKey as never)}
              icon={overlay.icon as IconName}
              value={overlays.includes(overlay.id)}
              onValueChange={() => store.toggleOverlay(overlay.id)}
            />
          ))}
        </ListSection>
      </Page>
    </Screen>
  );
}
