import { Pressable, StyleSheet } from 'react-native';

import { color, motion, opacity, radius, size, space } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import { Text } from './text';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  /** `primary` for the screen's main action, `secondary` for the others. */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
};

/** Full-width Material 3 button (Android and web): filled for primary, tonal for secondary. */
export function Button({ label, onPress, variant = 'primary', disabled = false }: ButtonProps) {
  const reducedMotion = useReducedMotion();
  const primary = variant === 'primary';

  return (
    <Pressable
      role="button"
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.primary : styles.secondary,
        pressed && (primary ? styles.primaryPressed : styles.secondaryPressed),
        pressed && !reducedMotion && styles.scaled,
        disabled && styles.disabled,
      ]}
    >
      <Text variant="label" style={{ color: primary ? color.onFab : color.onSecondaryContainer }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: size.touch,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  primary: { backgroundColor: color.primary },
  primaryPressed: { backgroundColor: color.fab },
  secondary: { backgroundColor: color.secondaryContainer },
  secondaryPressed: { backgroundColor: color.secondaryContainerPressed },
  scaled: { transform: [{ scale: motion.pressScale }] },
  disabled: { opacity: opacity.disabled },
});
