import { ViewAnnotation } from '@maplibre/maplibre-react-native';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/core/adaptive/icon';
import { color, shadow } from '@/core/theme/tokens';
import type { LngLat } from '@/features/map/domain/entities/trail';

import { legHandle } from './leg-router';
import { useMapStore, type HandleTarget } from './stores/map-store';

const STOP_ICONS = { start: 'trip_origin', goal: 'flag', end: 'sports_score' } as const;
/** How far a finger may wander on the selected handle and still tap it (points). */
const TAP_SLOP = 8;

type DragEvent = { nativeEvent: { lngLat: unknown; point?: [number, number] } };
/** Where the selected handle's touch began (one finger, one drag at a time). */
let from: [number, number] | null | undefined = null;

/**
 * The line's handles (track-drawing "Shape the line"): a tap on a point or on the dot halfway along
 * a leg selects it (blue), a tap on the selected one lets it go. Only the selected handle drags, from
 * the first touch (the MapLibre patch): a drag that started elsewhere still pans the map. A touch on
 * it that doesn't move is that tap. While a handle is dragged the line runs straight through it; the
 * drop routes the legs it touches anew.
 */
export function TrackHandles() {
  const { t } = useTranslation();
  const handles = useMapStore((s) => s.editHandles);
  const zoom = useMapStore((s) => s.zoom) ?? 13;
  const drag = useMapStore((s) => s.drag);
  if (!handles) return null;
  // A dragged point's legs run straight through the finger: their middle dots wait for the drop.
  const moving = drag?.handles === handles ? drag.target : null;
  const waits = (leg: number) =>
    !!moving && 'point' in moving && (leg === moving.point - 1 || leg === moving.point);
  const lngLat = (event: { nativeEvent: { lngLat: unknown } }) =>
    event.nativeEvent.lngLat as LngLat;
  const isPicked = (target: HandleTarget) =>
    JSON.stringify(handles.picked) === JSON.stringify(target);
  // The line follows the finger, straight through it (map-screen draws it from `drag`).
  const follow = (target: HandleTarget) => (event: { nativeEvent: { lngLat: unknown } }) =>
    useMapStore.setState({ drag: { handles, target, at: lngLat(event) } });
  /** The selected handle: dragged from the first touch, a touch that stays put lets it go. */
  const dragging = (target: HandleTarget, drop: (to: LngLat) => void) =>
    isPicked(target)
      ? {
          draggable: true,
          onDragStart: (event: DragEvent) => {
            from = event.nativeEvent.point;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
          onDrag: follow(target),
          onDragEnd: (event: DragEvent) => {
            const to = event.nativeEvent.point;
            const still = !!from && !!to && Math.hypot(to[0] - from[0], to[1] - from[1]) < TAP_SLOP;
            from = null;
            if (still) {
              useMapStore.setState({ drag: null });
              handles.pick(target);
            } else drop(lngLat(event));
          },
        }
      : {};

  return (
    <>
      {handles.legs.map((leg, i) => {
        const mid =
          leg.length > 1 && !waits(i) && i < (handles.upTo ?? Infinity)
            ? legHandle(leg, zoom)
            : null;
        if (!mid) return null;
        const picked = isPicked({ leg: i });
        return (
          <ViewAnnotation
            key={`leg-${i}-${mid.join()}`}
            id={`leg-${i}`}
            lngLat={mid}
            {...dragging({ leg: i }, (to) => handles.pull(i, to))}
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
        if (i > (handles.upTo ?? Infinity)) return null;
        const picked = isPicked({ point: i });
        return (
          <ViewAnnotation
            key={`point-${i}-${point.at.join()}`}
            id={`point-${i}`}
            lngLat={point.at}
            {...dragging({ point: i }, (to) => handles.move(i, to))}
            onPress={() => handles.pick({ point: i })}
          >
            <View style={styles.target} accessibilityElementsHidden>
              {point.kind === 'via' ? (
                <View style={[styles.via, picked && styles.viaPicked]} />
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
    width: 22,
    height: 22,
    borderRadius: 11,
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
  viaPicked: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.primary,
    borderColor: color.background,
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
  stopPicked: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: color.primary,
    borderColor: color.background,
  },
});
