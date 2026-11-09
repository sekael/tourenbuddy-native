import { Pressable, StyleSheet } from 'react-native';

import { color, motion, opacity, radius, size, space } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import { Text } from './text';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /** `primary` for the screen's main action, `secondary` for the others, `plain` for a way elsewhere. */
  variant?: 'primary' | 'secondary' | 'plain';
  disabled?: boolean;
};

/**
 * Full-width Material 3 button (Android and web): filled for primary, tonal for secondary, a text
 * button for plain.
 */
export function Button({ label, onPress, variant = 'primary', disabled = false }: ButtonProps) {
  const reducedMotion = useReducedMotion();

  return (
    <Pressable
      role="button"
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && pressedStyles[variant],
        pressed && !reducedMotion && styles.scaled,
        disabled && styles.disabled,
      ]}
    >
      <Text variant="label" style={{ color: labelColor[variant] }}>
        {label}
      </Text>
    </Pressable>
  );
}

const labelColor = {
  primary: color.onFab,
  secondary: color.onSecondaryContainer,
  plain: color.primary,
} as const;

const styles = StyleSheet.create({
  button: {
    minHeight: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  primary: { backgroundColor: color.primary },
  secondary: { backgroundColor: color.secondaryContainer },
  plain: {},
  scaled: { transform: [{ scale: motion.pressScale }] },
  disabled: { opacity: opacity.disabled },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: color.fab },
  secondary: { backgroundColor: color.secondaryContainerPressed },
  plain: { backgroundColor: color.surfaceVariant },
});
