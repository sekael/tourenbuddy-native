import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState, ListRow, ListSection, TextRow } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { color } from '@/core/theme/tokens';
import { formatBytes } from '@/core/utils/format-bytes';
import {
  estimateBytes,
  framedBounds,
  REGION_FRAME,
  SWITZERLAND_REGIONS,
} from '@/features/map/domain/offline-regions';
import { suggestAreaName } from '@/features/tours/data/services/swisstopo-name-service';

import { useMapStore } from './stores/map-store';
import {
  offlineMapsSupported,
  useOfflineMapsStore,
  type OfflineRegion,
} from './stores/offline-maps-store';

/** The saved regions show on the map, outlined, while a sheet of them is open. */
function useRegionsOnMap() {
  useEffect(() => {
    useMapStore.setState((s) => ({ regionsShown: s.regionsShown + 1 }));
    return () => useMapStore.setState((s) => ({ regionsShown: s.regionsShown - 1 }));
  }, []);
}

/** The map shows `regions` whole above the sheet. */
function frameRegions(regions: OfflineRegion[]) {
  if (!regions.length) return;
  useMapStore.getState().requestCamera({
    kind: 'fit',
    bounds: [
      [Math.min(...regions.map((r) => r.bounds[0])), Math.min(...regions.map((r) => r.bounds[1]))],
      [Math.max(...regions.map((r) => r.bounds[2])), Math.max(...regions.map((r) => r.bounds[3]))],
    ],
  });
}

/**
 * Offline maps (offline-map): the downloaded regions with their size and state (outlined on the
 * map; a tap shows one whole), a region framed on the map, or all of Switzerland in four regions.
 */
export function OfflineMapsSheet() {
  const { t } = useTranslation();
  const regions = useOfflineMapsStore((s) => s.regions);
  const loaded = useOfflineMapsStore((s) => s.loaded);
  const error = useOfflineMapsStore((s) => s.error);
  const store = useOfflineMapsStore.getState();
  const total = regions.reduce((sum, r) => sum + r.bytes, 0);

  useEffect(() => {
    // Opening the list shows the saved regions on the map, wherever they are.
    void useOfflineMapsStore
      .getState()
      .load()
      .then(() => frameRegions(useOfflineMapsStore.getState().regions));
  }, []);
  useRegionsOnMap();

  const confirmDelete = (region: OfflineRegion) =>
    Alert.alert(t('offlineMap.manage.delete'), region.name, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('offlineMap.manage.delete'),
        style: 'destructive',
        onPress: () => void store.remove(region.id),
      },
    ]);

  // A download under way is stopped, what it fetched dropped.
  const confirmCancel = (region: OfflineRegion) =>
    Alert.alert(t('offlineMap.manage.cancelDownload'), region.name, [
      { text: t('offlineMap.manage.keepDownloading'), style: 'cancel' },
      {
        text: t('offlineMap.manage.cancelDownload'),
        style: 'destructive',
        onPress: () => void store.cancel(region.id),
      },
    ]);

  /** The row's way out: cancel a download under way, else delete the region. */
  const dropAction = (region: OfflineRegion) =>
    region.state === 'downloading'
      ? {
          label: t('offlineMap.manage.cancelDownload'),
          icon: 'stop_circle' as const,
          destructive: true,
          onPress: () => confirmCancel(region),
        }
      : {
          label: t('offlineMap.manage.delete'),
          icon: 'delete' as const,
          destructive: true,
          onPress: () => confirmDelete(region),
        };

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
              : // The total once there is more than one row to add up.
                regions.length > 1
                ? formatBytes(total)
                : undefined
          }
        >
          {loaded && !regions.length ? (
            // A section of only a footer does not show: the empty list says so in a row.
            <ListRow title={t('offlineMap.manage.empty')} icon="cloud_off" />
          ) : null}
          {regions.map((region) => (
            <ListRow
              key={region.id}
              title={region.name || t('offlineMap.download.untitled')}
              subtitle={
                region.state === 'downloading'
                  ? t('offlineMap.manage.downloading', { percent: region.percentage })
                  : region.state === 'incomplete'
                    ? `${t('offlineMap.manage.incomplete')} · ${formatBytes(region.bytes)}`
                    : t('offlineMap.manage.ready', { size: formatBytes(region.bytes) })
              }
              progress={region.state === 'downloading' ? region.percentage / 100 : undefined}
              icon={
                region.state === 'complete'
                  ? 'download_for_offline'
                  : region.state === 'downloading'
                    ? 'download'
                    : 'warning'
              }
              iconColor={region.state === 'incomplete' ? color.error : undefined}
              // A download under way stops with the button at its end, as in the App Store; a
              // saved region's tap offers what it can do: show it, download it again, delete it.
              accessory={region.state === 'downloading' ? dropAction(region) : undefined}
              menu={
                region.state === 'downloading'
                  ? undefined
                  : [
                      {
                        label: t('offlineMap.manage.showOnMap'),
                        icon: 'map',
                        onPress: () => frameRegions([region]),
                      },
                      ...(region.state === 'incomplete'
                        ? [
                            {
                              label: t('offlineMap.manage.redownload'),
                              icon: 'replay' as const,
                              onPress: () => void store.redownload(region.id),
                            },
                          ]
                        : []),
                      dropAction(region),
                    ]
              }
              swipeActions={[dropAction(region)]}
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

/**
 * Framing a region (offline-map, as the PWA): a frame over the map marks the region; the user
 * moves the map under it, its size estimated as it moves. Named, it downloads in the background.
 */
export function OfflineRegionSheet() {
  const { t } = useTranslation();
  const bounds = useMapStore((s) => s.bounds);
  const [name, setName] = useState('');
  /** The user wrote a name: it stays as the frame moves. */
  const [named, setNamed] = useState(false);
  const region = bounds ? framedBounds(bounds, REGION_FRAME) : null;
  const size = region ? formatBytes(estimateBytes(region)) : '…';

  // A name prefilled, as in the PWA, from Swisstopo's names at the framed area's centre: its valley,
  // town or area first ("Lauterbrunnental"), else the spot's name a tour would get, else its
  // coordinates. It follows the frame until the user writes their own.
  const centre = region
    ? { lng: (region[0] + region[2]) / 2, lat: (region[1] + region[3]) / 2 }
    : null;
  const centreKey = centre ? `${centre.lng.toFixed(3)},${centre.lat.toFixed(3)}` : null;
  useEffect(() => {
    if (!centre || named) return;
    const lookup = new AbortController();
    const timer = setTimeout(
      () => {
        void suggestAreaName(centre, lookup.signal)
          .catch(() => null)
          .then((found) => {
            if (!lookup.signal.aborted) {
              setName(found ?? `${centre.lat.toFixed(3)}, ${centre.lng.toFixed(3)}`);
            }
          });
        // At once as the sheet opens, so the name is there before the user reaches the field.
      },
      name ? 400 : 0,
    );
    return () => {
      clearTimeout(timer);
      lookup.abort();
    };
    // The centre's key alone: a new frame, not a new object for the same one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreKey, named]);
  useRegionsOnMap();
  useEffect(() => {
    useMapStore.setState({ regionFrame: true });
    return () => useMapStore.setState({ regionFrame: false });
  }, []);

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
        // The bar holds Cancel and Download; the title heads the section, where it fits.
        title={t('offlineMap.download.sheetTitle')}
        titleInHeader
        cancel={{ label: t('offlineMap.draw.cancel'), onPress: () => router.back() }}
        confirm={{ label: t('offlineMap.download.start'), onPress: start, disabled: !region }}
      >
        <ListSection
          title={t('offlineMap.download.sheetTitle')}
          footer={`${t('offlineMap.draw.hintFrame')} ${t('offlineMap.download.estimate', { size })}`}
        >
          <TextRow
            label={t('offlineMap.download.nameLabel')}
            placeholder={t('offlineMap.download.untitled')}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setNamed(true);
            }}
            autoCapitalize="words"
          />
        </ListSection>
      </Page>
    </Screen>
  );
}
