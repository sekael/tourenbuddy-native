import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { color, radius, space, strong } from '@/core/theme/tokens';

import { Text } from './text';

export type Segment<T extends string | number> = {
  value: T;
  label: string;
  /** Greyed, not to be picked. */
  disabled?: boolean;
};

/**
 * One of a few as one pill cut in parts (the PWA's way switch), drawn by React Native on every
 * platform: a part can show greyed, which the system's segmented control cannot.
 */
export function Segments<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View role="radiogroup" aria-label={label} style={styles.segments}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            role="radio"
            aria-checked={selected}
            aria-disabled={option.disabled}
            disabled={option.disabled}
            onPress={() => {
              if (selected) return;
              void Haptics.selectionAsync();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              i > 0 && styles.divided,
              selected && styles.selected,
              pressed && !selected && styles.pressed,
            ]}
          >
            {/* At the largest text sizes a label shrinks to fit its part, as the system's do. */}
            <Text
              variant="caption"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={
                selected ? styles.selectedText : option.disabled ? styles.disabledText : styles.text
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segments: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.outlineVariant,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    backgroundColor: color.background,
  },
  divided: { borderLeftWidth: 1, borderLeftColor: color.outlineVariant },
  selected: { backgroundColor: color.secondaryContainer },
  pressed: { backgroundColor: color.neutralContainer },
  text: { color: color.onSurfaceVariant },
  selectedText: { ...strong, color: color.onSecondaryContainer },
  disabledText: { color: color.onSurfaceVariant, opacity: 0.4 },
});
