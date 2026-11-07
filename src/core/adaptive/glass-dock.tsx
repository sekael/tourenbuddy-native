import {
  Button,
  Capsule,
  Host,
  HStack,
  Image,
  Menu,
  Namespace,
  Text,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityLabel,
  Animation,
  animation,
  buttonBorderShape,
  buttonStyle,
  contentShape,
  dynamicTypeSize,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  matchedGeometryEffect,
  padding,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { color, size, space } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import type { FloatingMenuItem } from './floating-menu';
import { icons, type IconName } from './icons';

export type DockTab = { name: string; label: string; icon: IconName; selected: boolean };

type GlassDockProps = {
  tabs: DockTab[];
  onSelect: (name: string) => void;
  menuLabel: string;
  menuItems: FloatingMenuItem[];
};

const inset = space.xxs;
// Two places beside the menu circle fit the narrowest supported iPhone (375 pt) with room to spare.
const tabWidth = 88;

/**
 * The bottom row on iOS, in place of the system tab bar: the places in a Liquid Glass capsule at
 * the leading edge, the menu as a glass circle of the same height at the trailing edge, level with
 * each other in the thumb zone. The system menu morphs out of the circle with the first item
 * nearest it. Touches between the two reach the screen beneath.
 */
export function GlassDock({ tabs, onSelect, menuLabel, menuItems }: GlassDockProps) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const namespace = useId();
  const selected = tabs.findIndex((tab) => tab.selected);

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.row,
        {
          // Where the system tab bar sits: into the home indicator's inset, not on top of it.
          bottom: Math.max(insets.bottom - space.sm, space.md),
          left: insets.left + space.lg,
          right: insets.right + space.lg,
        },
      ]}
    >
      <Host matchContents>
        <Namespace id={namespace}>
          <HStack
            spacing={0}
            modifiers={[
              padding({ all: inset }),
              glassEffect({ glass: { variant: 'regular', interactive: true }, shape: 'capsule' }),
              accessibilityElement('contain'),
              accessibilityAddTraits(['isTabBar']),
              // Labels follow the text size up to the largest size that still fits the pill.
              dynamicTypeSize({ max: 'xxxLarge' }),
              // The selection pill glides to the chosen place; with Reduce Motion it moves at once.
              ...(reduceMotion ? [] : [animation(Animation.smooth(), selected)]),
            ]}
          >
            {tabs.map((tab) => {
              const tint = tab.selected ? color.primary : color.onSurface;
              return (
                <Button
                  key={tab.name}
                  onPress={() => onSelect(tab.name)}
                  modifiers={[
                    buttonStyle('plain'),
                    accessibilityLabel(tab.label),
                    accessibilityAddTraits(tab.selected ? ['isSelected'] : []),
                  ]}
                >
                  <ZStack
                    modifiers={[
                      frame({ width: tabWidth, height: size.dock - 2 * inset }),
                      // The whole pill takes the tap, not just the glyph and label.
                      contentShape(shapes.capsule()),
                    ]}
                  >
                    {tab.selected && (
                      <Capsule
                        modifiers={[
                          // A system fill, so it follows Increase Contrast like the glass around it.
                          foregroundStyle({ type: 'hierarchical', style: 'quaternary' }),
                          matchedGeometryEffect('selection', namespace),
                        ]}
                      />
                    )}
                    <VStack spacing={space.xxs}>
                      <Image systemName={icons[tab.icon].sf} size={size.icon} color={tint} />
                      <Text
                        modifiers={[
                          font({ textStyle: 'caption2', weight: 'semibold' }),
                          foregroundStyle(tint),
                        ]}
                      >
                        {tab.label}
                      </Text>
                    </VStack>
                  </ZStack>
                </Button>
              );
            })}
          </HStack>
        </Namespace>
      </Host>
      <Host matchContents>
        {/* Glass from the button style, not glassEffect(): Expo warns the latter leaves a halo
            behind a menu as it closes. The frame sizes the circle; the label may grow into it,
            so the glass behind it covers the whole 60 pt. */}
        <Menu
          label={
            <Image
              systemName={icons.menu.sf}
              size={size.icon}
              color={color.onSurface}
              modifiers={[frame({ maxWidth: size.dock, maxHeight: size.dock })]}
            />
          }
          modifiers={[
            buttonStyle('glass'),
            buttonBorderShape('circle'),
            frame({ width: size.dock, height: size.dock }),
            accessibilityLabel(menuLabel),
          ]}
        >
          {menuItems.map((item) => (
            <Button
              key={item.id}
              label={item.label}
              systemImage={icons[item.icon].sf}
              onPress={item.onPress}
            />
          ))}
        </Menu>
      </Host>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
