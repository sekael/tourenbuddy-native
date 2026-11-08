import { Button as SwiftUIButton, Host, Text } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  disabled as disabledModifier,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet } from 'react-native';

import { color } from '@/core/theme/tokens';

import type { ButtonProps } from './button';

/**
 * The system button (iOS), full width, in Liquid Glass: prominent glass tinted with the brand color
 * for primary, clear glass for secondary.
 */
export function Button({ label, onPress, variant = 'primary', disabled = false }: ButtonProps) {
  return (
    <Host matchContents={{ vertical: true }} style={styles.host}>
      <SwiftUIButton
        onPress={onPress}
        modifiers={[
          buttonStyle(variant === 'primary' ? 'glassProminent' : 'glass'),
          buttonBorderShape('capsule'),
          controlSize('large'),
          tint(color.primary),
          disabledModifier(disabled),
        ]}
      >
        <Text modifiers={[frame({ maxWidth: Infinity })]}>{label}</Text>
      </SwiftUIButton>
    </Host>
  );
}

const styles = StyleSheet.create({ host: { alignSelf: 'stretch' } });
