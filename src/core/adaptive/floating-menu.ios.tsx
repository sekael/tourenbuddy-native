import { Button, Host, Menu } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  labelStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, space } from '@/core/theme/tokens';

import type { FloatingMenuProps } from './floating-menu';
import { icons } from './icons';

export type { FloatingMenuItem, FloatingMenuProps } from './floating-menu';

/**
 * Liquid Glass menu button (iOS) in the bottom-trailing corner, above the tab bar. The system menu
 * morphs out of the glass and puts the first item nearest the button.
 */
export function FloatingMenu({ label, items }: FloatingMenuProps) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <SafeAreaView
        edges={['bottom', 'left', 'right']}
        style={styles.anchor}
        pointerEvents="box-none"
      >
        <Host matchContents style={styles.host}>
          <Menu
            label={label}
            systemImage={icons.menu.sf}
            modifiers={[
              buttonStyle('glass'),
              buttonBorderShape('circle'),
              controlSize('extraLarge'),
              labelStyle('iconOnly'),
              tint(color.primary),
            ]}
          >
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
  host: { margin: space.md },
});
