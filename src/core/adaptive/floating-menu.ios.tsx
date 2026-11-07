import { Button, Host, Image, Menu } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  frame,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, size, space } from '@/core/theme/tokens';

import type { FloatingMenuProps } from './floating-menu';
import { icons } from './icons';

/**
 * The menu on iOS: a Liquid Glass circle in the bottom-trailing corner, right above the system
 * tab bar. The system menu morphs out of the glass; opening upwards, it puts the first item nearest
 * the circle. It closes itself on a tap outside or the VoiceOver escape gesture, and follows
 * Reduce Motion and Reduce Transparency.
 */
// No `closeLabel`: the system menu takes VoiceOver focus while open, and the circle stays "Menu".
export function FloatingMenu({ label, items }: Pick<FloatingMenuProps, 'label' | 'items'>) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* The native safe area of a tab ends at the tab bar, so the circle sits right above it. */}
      <SafeAreaView
        edges={['bottom', 'left', 'right']}
        style={styles.anchor}
        pointerEvents="box-none"
      >
        <Host matchContents style={styles.host}>
          <Menu
            label={
              <Image
                systemName={icons.menu.sf}
                size={size.icon}
                color={color.onSurface}
                modifiers={[frame({ maxWidth: size.menu, maxHeight: size.menu })]}
              />
            }
            modifiers={[
              // Glass from the button style: `glassEffect()` leaves a halo as the menu closes.
              buttonStyle('glass'),
              buttonBorderShape('circle'),
              // Sizes the circle; the glyph may grow into it, so the glass covers all of it.
              frame({ width: size.menu, height: size.menu }),
              accessibilityLabel(label),
            ]}
          >
            {/* No tint: the system draws the entries monochrome. */}
            {items.map((item) => (
              <Button
                key={item.id}
                label={item.label}
                systemImage={icons[item.icon].sf}
                onPress={item.onPress}
              />
            ))}
          </Menu>
        </Host>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: 0, bottom: 0, left: 0, alignItems: 'flex-end' },
  host: { marginHorizontal: space.lg, marginBottom: space.sm },
});
