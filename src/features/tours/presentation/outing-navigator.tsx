import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/core/adaptive/icon';
import type { IconName } from '@/core/adaptive/icons';
import { Text } from '@/core/adaptive/text';
import { color, radius, size, space, strong } from '@/core/theme/tokens';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingDisplayName } from '@/features/tours/domain/outing';

/**
 * Where a stage sits in its outing, at the top of its sheet (tour-outings, the PWA's navigator):
 * the outing's name and "Etappe 2 von 3", a tap away from the overview, and ‹ › to the stage
 * before or after, so stepping works with the sheet low and the map beside it.
 */
export function OutingNavigator({
  segments,
  index,
  onOpenOuting,
  onStep,
}: {
  /** The outing's stages in order. */
  segments: Tour[];
  index: number;
  onOpenOuting: () => void;
  onStep: (id: string) => void;
}) {
  const { t } = useTranslation();
  const prev = segments[index - 1];
  const next = segments[index + 1];
  const name = outingDisplayName(segments) ?? t('tours.infoSheet.unnamedTour');
  const position = t('tours.outing.segmentOf', { n: index + 1, count: segments.length });
  const step = (to: Tour | undefined) => {
    if (!to) return;
    void Haptics.selectionAsync();
    onStep(to.id);
  };

  return (
    <View style={styles.navigator}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${position}`}
        accessibilityHint={t('tours.outing.openOverview')}
        onPress={onOpenOuting}
        style={({ pressed }) => [styles.outing, pressed && styles.pressed]}
      >
        <Icon name="timeline" size={22} color={color.onSurfaceVariant} />
        <View style={styles.text}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" style={styles.position} numberOfLines={1}>
            {position}
          </Text>
        </View>
      </Pressable>
      <StepButton
        icon="chevron_left"
        label={t('tours.outing.previous')}
        hint={prev?.name ?? undefined}
        disabled={!prev}
        onPress={() => step(prev)}
      />
      <StepButton
        icon="chevron_right"
        label={t('tours.outing.next')}
        hint={next?.name ?? undefined}
        disabled={!next}
        onPress={() => step(next)}
      />
    </View>
  );
}

function StepButton({
  icon,
  label,
  hint,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string | undefined;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(hint ? { accessibilityHint: hint } : {})}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={2}
      style={({ pressed }) => [styles.step, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Icon name={icon} size={24} color={color.onSurface} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  navigator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs,
    padding: space.xxs,
    borderRadius: radius.md,
    backgroundColor: color.neutralContainer,
  },
  outing: {
    flex: 1,
    minWidth: 0,
    minHeight: size.mapControl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xxs,
    borderRadius: radius.sm,
  },
  text: { flex: 1, minWidth: 0 },
  name: { ...strong, color: color.onSurface },
  position: { color: color.onSurfaceVariant },
  step: {
    width: size.mapControl,
    height: size.mapControl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: color.background },
  disabled: { opacity: 0.3 },
});
