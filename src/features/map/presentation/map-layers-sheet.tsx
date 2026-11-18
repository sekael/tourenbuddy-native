import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';
import { useStore } from 'zustand';

import { Icon } from '@/core/adaptive/icon';
import type { IconName } from '@/core/adaptive/icons';
import { ContentRow, ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { connectivity } from '@/core/offline/online';
import { color, radius, space } from '@/core/theme/tokens';
import { TRAIL_OVERLAYS, type TrailOverlayId } from '@/features/map/data/trail-overlays';

import { OfflineMapsPage, RegionPage } from './offline-maps-sheet';
import { BASE_STYLES } from './map-styles';
import { useMapStore } from './stores/map-store';
import { useOfflineMapsStore } from './stores/offline-maps-store';

/** What each overlay looks like on the map, as the PWA's layer panel shows it. */
const OVERLAY_PREVIEWS: Record<TrailOverlayId, { image: ImageSourcePropType; chip: string }> = {
  hiking: { image: require('../../../../assets/images/map-layers/hiking.png'), chip: color.error },
  ski: { image: require('../../../../assets/images/map-layers/ski.png'), chip: color.primary },
};

/**
 * The map's options (map-layers), behind the round map button: the base map (one of them) and the
 * trail overlays (any combination), each a preview of how it looks, as in the PWA's layer panel;
 * then what the markers mean and the offline maps. Overlays need a connection unless their area is
 * downloaded.
 */
export function MapLayersSheet() {
  // Offline maps and framing a region are pages pushed inside this sheet: back from either is a
  // slide back, never the sheet closing and opening again.
  const [path, setPath] = useState<string[]>([]);
  // The regions read before the offline maps page is pushed: it slides in with its rows, at its
  // final height, instead of growing as they arrive.
  useEffect(() => {
    void useOfflineMapsStore.getState().load();
  }, []);
  return (
    <Screen
      fit
      path={path}
      onPathChange={setPath}
      renderPage={(value) =>
        value === 'region' ? (
          <RegionPage onDone={() => setPath(['offline'])} />
        ) : (
          <OfflineMapsPage onRegion={() => setPath(['offline', 'region'])} />
        )
      }
    >
      <LayersPage onOffline={() => setPath(['offline'])} />
    </Screen>
  );
}

function LayersPage({ onOffline }: { onOffline: () => void }) {
  const { t } = useTranslation();
  const styleIndex = useMapStore((s) => s.styleIndex);
  const overlays = useMapStore((s) => s.overlays);
  const online = useStore(connectivity, (s) => s.online);
  const store = useMapStore.getState();

  return (
    <Page title={t('map.overlay.mapLayers')} onClose={() => router.back()}>
      {/* Base maps and overlays side by side: both in view at the sheet's half height. */}
      <ListSection footer={online ? undefined : t('map.layers.needsConnection')}>
        <ContentRow>
          <View style={styles.groups}>
            <View style={styles.group}>
              <Text variant="caption" style={styles.groupTitle} role="heading">
                {t('map.layers.baseMap')}
              </Text>
              <View style={styles.tiles}>
                {BASE_STYLES.map((style, index) => (
                  <LayerTile
                    key={style.labelKey}
                    label={t(style.labelKey)}
                    image={style.thumbnail}
                    selected={index === styleIndex}
                    role="radio"
                    onPress={() => {
                      if (index === styleIndex) return;
                      void Haptics.selectionAsync();
                      store.setStyleIndex(index);
                    }}
                  />
                ))}
              </View>
            </View>
            <View style={styles.group}>
              <Text variant="caption" style={styles.groupTitle} role="heading">
                {t('map.layers.overlays.title')}
              </Text>
              <View style={styles.tiles}>
                {TRAIL_OVERLAYS.map((overlay) => (
                  <LayerTile
                    key={overlay.id}
                    label={t(overlay.labelKey as never)}
                    image={OVERLAY_PREVIEWS[overlay.id].image}
                    icon={overlay.icon as IconName}
                    chip={OVERLAY_PREVIEWS[overlay.id].chip}
                    selected={overlays.includes(overlay.id)}
                    role="checkbox"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      store.toggleOverlay(overlay.id);
                    }}
                  />
                ))}
              </View>
            </View>
          </View>
        </ContentRow>
      </ListSection>
      <ListSection>
        <ListRow
          title={t('map.overlay.offlineMap')}
          icon="download_for_offline"
          // Pushed inside this sheet, as the legend: its back button returns here.
          onPress={onOffline}
        />
        {/* A sheet of its own over this one, at full height (owner's choice, 2026-11-18). */}
        <ListRow title={t('map.legend.title')} icon="info" onPress={() => router.push('/legend')} />
      </ListSection>
    </Page>
  );
}

/** A layer's preview: the map as it looks with it, outlined and ticked while on. */
function LayerTile({
  label,
  image,
  icon,
  chip,
  selected,
  role,
  onPress,
}: {
  label: string;
  image: ImageSourcePropType;
  icon?: IconName;
  chip?: string;
  selected: boolean;
  role: 'radio' | 'checkbox';
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={styles.tile}
    >
      <View style={[styles.thumb, selected && styles.thumbSelected]}>
        <Image source={image} style={[styles.image, !selected && styles.imageOff]} />
        {icon && chip ? (
          <View style={[styles.chip, { backgroundColor: chip }]}>
            <Icon name={icon} size={12} color={color.onContrast} />
          </View>
        ) : null}
        {selected ? (
          <View style={styles.badge}>
            <Icon name="check" size={14} color={color.onContrast} />
          </View>
        ) : null}
      </View>
      <Text
        variant="caption"
        style={[styles.label, selected && styles.labelSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const THUMB = 64;

const styles = StyleSheet.create({
  // Side by side; at large text sizes the overlays go under the base maps rather than off the card.
  groups: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: space.md,
    paddingVertical: space.xs,
  },
  group: { gap: space.xs },
  groupTitle: { color: color.onSurfaceVariant },
  tiles: { flexDirection: 'row', gap: space.sm },
  // As wide as its name, so every name shows whole and at one size.
  tile: { minWidth: THUMB + space.xs, alignItems: 'center', gap: space.xxs },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.sm + 4,
    borderWidth: 2.5,
    borderColor: 'transparent',
    padding: 2,
  },
  thumbSelected: { borderColor: color.primary },
  image: { flex: 1, width: undefined, borderRadius: radius.sm - 1 },
  imageOff: { opacity: 0.75 },
  chip: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -7,
    right: -7,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: color.primary,
    borderWidth: 2,
    borderColor: color.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: color.onSurfaceVariant },
  labelSelected: { color: color.onSurface, fontWeight: '600' },
});
