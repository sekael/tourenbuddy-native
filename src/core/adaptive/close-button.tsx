import { Pressable, StyleSheet } from 'react-native';

import { color, motion, size } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import { Icon } from './icon';

export type CloseButtonProps = { label: string; onPress: () => void };

/** Tonal round close button (Android and web). */
export function CloseButton({ label, onPress }: CloseButtonProps) {
  const reducedMotion = useReducedMotion();

  return (
    <Pressable
      role="button"
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        pressed && !reducedMotion && styles.scaled,
      ]}
    >
      <Icon name="close" color={color.onSecondaryContainer} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: size.touch,
    height: size.touch,
    borderRadius: size.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.secondaryContainer,
  },
  pressed: { backgroundColor: color.secondaryContainerPressed },
  scaled: { transform: [{ scale: motion.pressScale }] },
});
