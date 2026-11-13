import { ViewAnnotation } from '@maplibre/maplibre-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/core/adaptive/icon';
import { color, shadow } from '@/core/theme/tokens';
import type { LngLat } from '@/features/map/domain/entities/trail';

import { legHandle } from './leg-router';
import { useMapStore } from './stores/map-store';

const STOP_ICONS = { start: 'trip_origin', goal: 'flag', end: 'sports_score' } as const;

/**
 * The line's handles (track-drawing "Shape the line"): hold a point and drag it to move it; hold
 * the dot halfway along a leg and drag it onto another way to send the line through there; tap a
 * pulled point to take it out again. Without dragging, a tap picks a point or a dot (it turns
 * blue) and the next map tap moves it there. Each change routes the legs it touches anew.
 */
export function TrackHandles() {
  const { t } = useTranslation();
  const handles = useMapStore((s) => s.editHandles);
  const zoom = useMapStore((s) => s.zoom) ?? 13;
  if (!handles) return null;
  const lngLat = (event: { nativeEvent: { lngLat: unknown } }) =>
    event.nativeEvent.lngLat as LngLat;
  const grab = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  return (
    <>
      {handles.legs.map((leg, i) => {
        const mid = leg.length > 1 ? legHandle(leg, zoom) : null;
        if (!mid) return null;
        const picked =
          handles.picked !== null && 'leg' in handles.picked && handles.picked.leg === i;
        return (
          <ViewAnnotation
            key={`leg-${i}-${mid.join()}`}
            id={`leg-${i}`}
            lngLat={mid}
            draggable
            onDragStart={grab}
            onDragEnd={(event) => handles.pull(i, lngLat(event))}
            onPress={() => handles.pick({ leg: i })}
          >
            <View
              style={styles.target}
              accessibilityLabel={t('map.plan.hint.shape')}
              accessibilityElementsHidden
            >
              <View style={[styles.mid, picked && styles.midPicked]} />
            </View>
          </ViewAnnotation>
        );
      })}
      {handles.points.map((point, i) => {
        const picked =
          handles.picked !== null && 'point' in handles.picked && handles.picked.point === i;
        return (
          <ViewAnnotation
            key={`point-${i}-${point.at.join()}`}
            id={`point-${i}`}
            lngLat={point.at}
            draggable
            onDragStart={grab}
            onDragEnd={(event) => handles.move(i, lngLat(event))}
            onPress={() => (point.kind === 'via' ? handles.drop(i) : handles.pick({ point: i }))}
          >
            <View style={styles.target} accessibilityElementsHidden>
              {point.kind === 'via' ? (
                <View style={styles.via} />
              ) : (
                <View style={[styles.stop, picked && styles.stopPicked]}>
                  <Icon
                    name={STOP_ICONS[point.kind]}
                    size={16}
                    color={picked ? color.onContrast : color.primary}
                  />
                </View>
              )}
            </View>
          </ViewAnnotation>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  // A finger-sized target around a small mark.
  target: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mid: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: color.background,
    borderWidth: 3,
    borderColor: color.onSurface,
    boxShadow: shadow.md,
  },
  midPicked: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: color.primary,
    borderColor: color.background,
  },
  via: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: color.background,
    borderWidth: 4,
    borderColor: color.primary,
    boxShadow: shadow.md,
  },
  stop: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.background,
    borderWidth: 2,
    borderColor: color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.md,
  },
  stopPicked: { backgroundColor: color.primary, borderColor: color.background },
});
