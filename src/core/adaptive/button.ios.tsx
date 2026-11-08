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
 * for primary, clear glass for secondary; plain is a borderless button in the brand color.
 */
export function Button({ label, onPress, variant = 'primary', disabled = false }: ButtonProps) {
  return (
    <Host matchContents={{ vertical: true }} style={layout.host}>
      <SwiftUIButton
        onPress={onPress}
        modifiers={[
          buttonStyle(buttonStyles[variant]),
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

const buttonStyles = {
  primary: 'glassProminent',
  secondary: 'glass',
  plain: 'borderless',
} as const satisfies Record<NonNullable<ButtonProps['variant']>, string>;

const layout = StyleSheet.create({ host: { alignSelf: 'stretch' } });
