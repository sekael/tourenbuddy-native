import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState, ListRow, ListSection, TextRow } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { stepSheetOptions } from '@/core/adaptive/sheet';
import { color } from '@/core/theme/tokens';
import { formatBytes } from '@/core/utils/format-bytes';
import {
  boundsAboveSheet,
  estimateBytes,
  SWITZERLAND_REGIONS,
} from '@/features/map/domain/offline-regions';

import { useMapStore } from './stores/map-store';
import {
  offlineMapsSupported,
  useOfflineMapsStore,
  type OfflineRegion,
} from './stores/offline-maps-store';

/**
 * Offline maps (offline-map): the downloaded regions with their size and state, a region framed
 * on the map, or all of Switzerland in four regions.
 */
export function OfflineMapsSheet() {
  const { t } = useTranslation();
  const regions = useOfflineMapsStore((s) => s.regions);
  const loaded = useOfflineMapsStore((s) => s.loaded);
  const error = useOfflineMapsStore((s) => s.error);
  const store = useOfflineMapsStore.getState();
  const total = regions.reduce((sum, r) => sum + r.bytes, 0);

  useEffect(() => {
    void useOfflineMapsStore.getState().load();
  }, []);

  const confirmDelete = (region: OfflineRegion) =>
    Alert.alert(t('offlineMap.manage.delete'), region.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('offlineMap.manage.delete'),
        style: 'destructive',
        onPress: () => void store.remove(region.id),
      },
    ]);

  const downloadAll = () => {
    const bytes = SWITZERLAND_REGIONS.reduce((sum, r) => sum + estimateBytes(r.bounds), 0);
    Alert.alert(
      t('offlineMap.manage.wholeMap'),
      t('offlineMap.download.estimate', { size: formatBytes(bytes) }),
      [
        { text: t('offlineMap.download.cancel'), style: 'cancel' },
        {
          text: t('offlineMap.download.start'),
          onPress: () =>
            void (async () => {
              for (const region of SWITZERLAND_REGIONS) {
                await store.download(t(`offlineMap.regions.${region.key}` as never), region.bounds);
              }
            })(),
        },
      ],
    );
  };

  if (!offlineMapsSupported) {
    return (
      <Screen>
        <Page title={t('offlineMap.manage.title')} onClose={() => router.back()}>
          <EmptyState icon="cloud_off" title={t('offlineMap.manage.webUnavailable')} />
        </Page>
      </Screen>
    );
  }

  return (
    <Screen>
      <Page
        title={t('offlineMap.manage.title')}
        onClose={() => router.back()}
        onRefresh={store.load}
      >
        <ListSection
          footer={
            error
              ? t(`offlineMap.errors.${error}`)
              : regions.length
                ? formatBytes(total)
                : loaded
                  ? t('offlineMap.manage.empty')
                  : undefined
          }
        >
          {regions.map((region) => (
            <ListRow
              key={region.id}
              title={region.name || t('offlineMap.download.untitled')}
              subtitle={
                region.state === 'downloading'
                  ? `${region.percentage} %`
                  : region.state === 'incomplete'
                    ? `${t('offlineMap.manage.incomplete')} · ${formatBytes(region.bytes)}`
                    : formatBytes(region.bytes)
              }
              icon={
                region.state === 'complete'
                  ? 'download_for_offline'
                  : region.state === 'downloading'
                    ? 'download'
                    : 'warning'
              }
              iconColor={region.state === 'incomplete' ? color.error : undefined}
              chevron={false}
              onPress={() =>
                useMapStore.getState().requestCamera({
                  kind: 'fit',
                  bounds: [
                    [region.bounds[0], region.bounds[1]],
                    [region.bounds[2], region.bounds[3]],
                  ],
                })
              }
              swipeActions={[
                {
                  label: t('offlineMap.manage.delete'),
                  icon: 'delete',
                  destructive: true,
                  onPress: () => confirmDelete(region),
                },
              ]}
              contextActions={[
                ...(region.state === 'incomplete'
                  ? [
                      {
                        label: t('offlineMap.manage.redownload'),
                        icon: 'replay' as const,
                        onPress: () => void store.redownload(region.id),
                      },
                    ]
                  : []),
                {
                  label: t('offlineMap.manage.delete'),
                  icon: 'delete' as const,
                  destructive: true,
                  onPress: () => confirmDelete(region),
                },
              ]}
            />
          ))}
        </ListSection>
        <ListSection footer={t('offlineMap.manage.tip')}>
          <ListRow
            title={t('offlineMap.manage.drawRegion')}
            icon="add_location_alt"
            onPress={() => router.replace('/offline-region')}
          />
          <ListRow title={t('offlineMap.manage.wholeMap')} icon="map" onPress={downloadAll} />
        </ListSection>
      </Page>
    </Screen>
  );
}

/** The step sheet's taller height: the map above it is the region (the lower one shows more). */
const detents = stepSheetOptions.sheetAllowedDetents;
const COVERED = Array.isArray(detents) ? Math.max(...detents) : 0.55;

/**
 * Framing a region (offline-map): the user moves the map; the part above this sheet is the region,
 * its size estimated as it moves. Named, it downloads in the background.
 */
export function OfflineRegionSheet() {
  const { t } = useTranslation();
  const bounds = useMapStore((s) => s.bounds);
  const [name, setName] = useState('');
  const region = bounds ? boundsAboveSheet(bounds, COVERED) : null;
  const size = region ? formatBytes(estimateBytes(region)) : '…';

  const start = () => {
    if (!region) return;
    void useOfflineMapsStore
      .getState()
      .download(name.trim() || t('offlineMap.download.untitled'), region);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace('/offline-maps');
  };

  return (
    <Screen>
      <Page
        form
        title={t('offlineMap.download.sheetTitle')}
        cancel={{ label: t('offlineMap.draw.cancel'), onPress: () => router.back() }}
        confirm={{ label: t('offlineMap.download.start'), onPress: start, disabled: !region }}
      >
        <ListSection footer={t('offlineMap.draw.hintMobile', { size })}>
          <TextRow
            label={t('offlineMap.download.nameLabel')}
            placeholder={t('offlineMap.download.untitled')}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </ListSection>
      </Page>
    </Screen>
  );
}
