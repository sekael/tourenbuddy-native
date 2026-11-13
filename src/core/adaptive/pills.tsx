import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { color, radius, space, strong } from '@/core/theme/tokens';

import { Icon } from './icon';
import type { IconName } from './icons';
import { Text } from './text';

export type PillOption<T extends string> = {
  value: T;
  label: string;
  icon?: IconName;
  /** The icon's own colour (an activity's), kept when the pill is on. */
  iconColor?: string;
};

/**
 * Choices as pills that wrap (the PWA's chips): one tap picks or drops one, the picked ones filled
 * in the app's blue. `single` lets only one be on (a radio group); otherwise any number (a set of
 * checkboxes). Drawn by React Native on every platform, inside a list's `ContentRow`.
 */
export function Pills<T extends string>({
  options,
  selected,
  onToggle,
  single = false,
  accessibilityLabel,
}: {
  options: PillOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  single?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <View
      style={styles.wrap}
      accessibilityRole={single ? 'radiogroup' : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole={single ? 'radio' : 'checkbox'}
            accessibilityLabel={option.label}
            accessibilityState={{ checked: on }}
            hitSlop={{ top: 4, bottom: 4 }}
            onPress={() => {
              void Haptics.selectionAsync();
              onToggle(option.value);
            }}
            style={({ pressed }) => [styles.pill, on && styles.on, pressed && styles.pressed]}
          >
            {option.icon ? (
              <Icon
                name={option.icon}
                size={18}
                color={option.iconColor ?? (on ? color.onSecondaryContainer : color.primary)}
              />
            ) : null}
            <Text variant="caption" style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingVertical: space.xxs },
  pill: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs + 2,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.outlineVariant,
    backgroundColor: color.background,
  },
  on: { backgroundColor: color.secondaryContainer, borderColor: color.primary },
  pressed: { backgroundColor: color.secondaryContainerPressed },
  label: { color: color.onSurface },
  labelOn: { ...strong, color: color.onSecondaryContainer },
});
