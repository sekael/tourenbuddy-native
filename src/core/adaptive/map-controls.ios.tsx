import {
  Button,
  HStack,
  Host,
  Label,
  Rectangle,
  RNHostView,
  Text as SwiftText,
} from '@expo/ui/swift-ui';
import {
  accessibilityHint,
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  contentShape,
  controlSize,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  glassEffect,
  lineLimit,
  minimumScaleFactor,
  padding,
  shadow as swiftShadow,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import { GlassView } from 'expo-glass-effect';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { color, shadow, size, space } from '@/core/theme/tokens';

import { Icon } from './icon';
import { icons, type IconName } from './icons';
import type { CapsuleItem } from './map-controls';
import { Text } from './text';

export type { CapsuleItem } from './map-controls';

/** How far a control's text grows with the text size: the map's controls keep their place. */
const MAX_FONT_SCALE = 1.3;

/**
 * The capsule of the map's main actions (D6) in true Liquid Glass, the system tab bar's material
 * tinted with the app's blue: one interactive glass pill drawn by SwiftUI, a system button for each
 * part (the wide «Meine Touren», the narrow «+»), the app's own glyphs in white. The glass answers a
 * touch as the tab bar does; the part under the finger dims as a system button does. Nothing of
 * ours moves, so Reduce Motion has nothing to undo; the system follows Reduce Transparency.
 */
export function GlassCapsule({ items }: { items: CapsuleItem[]; label: string }) {
  const { width, fontScale } = useWindowDimensions();
  // As a system toolbar's title: the words grow with the text size only so far, and the pill
  // never grows past the room the round controls leave it (the words shrink to fit instead).
  const room = width - 2 * space.lg - 2 * size.mapControl - 2 * space.xs;
  const labelSize = Math.round(17 * Math.min(fontScale, MAX_FONT_SCALE));
  return (
    <Host matchContents style={styles.capsuleHost}>
      <HStack
        spacing={0}
        modifiers={[
          frame({ maxWidth: room }),
          glassEffect({
            glass: { variant: 'regular', tint: color.fabGlassTint, interactive: true },
            shape: 'capsule',
          }),
        ]}
      >
        {items.flatMap((item, index) => [
          ...(index > 0
            ? [
                <Rectangle
                  key={`${item.id}-divider`}
                  modifiers={[frame({ width: 1, height: 22 }), foregroundStyle(color.onFabDivider)]}
                />,
              ]
            : []),
          <Button
            key={item.id}
            onPress={item.onPress}
            modifiers={[
              buttonStyle('plain'),
              disabledModifier(!!item.disabled),
              accessibilityLabel(item.label),
              ...(item.hint ? [accessibilityHint(item.hint)] : []),
            ]}
          >
            <HStack
              spacing={space.xs - 2}
              modifiers={[
                padding({ horizontal: item.iconOnly ? 0 : space.md }),
                frame({
                  width: item.iconOnly ? size.mapControl + space.sm : undefined,
                  height: size.mapControl,
                }),
                // The whole part answers a tap, not only its glyph and words.
                contentShape(shapes.rectangle()),
              ]}
            >
              <RNHostView matchContents>
                <View pointerEvents="none" style={styles.glyph}>
                  <Icon name={item.icon} size={22} color={color.onFab} />
                </View>
              </RNHostView>
              {item.iconOnly ? null : (
                <SwiftText
                  modifiers={[
                    font({ size: labelSize, weight: 'semibold' }),
                    foregroundStyle(color.onFab),
                    lineLimit(1),
                    minimumScaleFactor(0.7),
                    // Lifts the white words off the glass where snow shines through it.
                    swiftShadow({
                      radius: shadow.glyph.radius,
                      y: shadow.glyph.offset.height,
                      color: color.onGlassShadow,
                    }),
                  ]}
                >
                  {item.label}
                </SwiftText>
              )}
            </HStack>
          </Button>,
        ])}
      </HStack>
    </Host>
  );
}

/**
 * A round map control (search, the map button) in the capsule's own blue Liquid Glass, so the row
 * reads as one: a system button in an interactive glass circle, the app's glyph in white.
 */
export function GlassCircleButton({
  label,
  hint,
  icon,
  onPress,
}: {
  label: string;
  hint?: string;
  icon: IconName;
  onPress: () => void;
}) {
  return (
    <Host matchContents style={styles.circle}>
      <Button
        onPress={onPress}
        modifiers={[
          buttonStyle('plain'),
          accessibilityLabel(label),
          ...(hint ? [accessibilityHint(hint)] : []),
        ]}
      >
        <HStack
          modifiers={[
            frame({ width: size.mapControl, height: size.mapControl }),
            contentShape(shapes.circle()),
            glassEffect({
              glass: { variant: 'regular', tint: color.fabGlassTint, interactive: true },
              shape: 'circle',
            }),
          ]}
        >
          <RNHostView matchContents>
            <View pointerEvents="none" style={styles.glyph}>
              <Icon name={icon} size={22} color={color.onFab} />
            </View>
          </RNHostView>
        </HStack>
      </Button>
    </Host>
  );
}

/**
 * A layer switch over the map (the step's overlays): a glass chip with its glyph and name, filled
 * with the capsule's blue while on. Interactive glass answers the press.
 */
export function GlassToggle({
  label,
  icon,
  on,
  onPress,
}: {
  label: string;
  icon: IconName;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <GlassView isInteractive tintColor={on ? color.fabGlass : color.glassTint} style={styles.chip}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: on }}
        onPress={onPress}
        style={styles.chipPress}
      >
        <View style={on && styles.glyph}>
          <Icon name={icon} size={20} color={on ? color.onFab : color.primary} />
        </View>
        <Text
          variant="label"
          style={on ? styles.label : styles.chipLabel}
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {label}
        </Text>
      </Pressable>
    </GlassView>
  );
}

/** A status capsule over the app (offline, syncing): glass, a button only when it leads somewhere. */
export function GlassStatus({
  label,
  icon,
  onPress,
  warning = false,
}: {
  label: string;
  icon: IconName;
  onPress?: () => void;
  warning?: boolean;
}) {
  const content = (
    <Label
      title={label}
      systemImage={icons[icon].sf}
      color={warning ? color.error : color.onSurface}
      modifiers={[font({ textStyle: 'footnote', weight: 'semibold' })]}
    />
  );
  return (
    <Host matchContents>
      {onPress ? (
        <Button
          onPress={onPress}
          modifiers={[
            buttonStyle('glass'),
            buttonBorderShape('capsule'),
            controlSize('small'),
            accessibilityLabel(label),
          ]}
        >
          {content}
        </Button>
      ) : (
        <HStack
          modifiers={[
            padding({ horizontal: space.sm, vertical: space.xs - 2 }),
            glassEffect({ glass: { variant: 'regular' }, shape: 'capsule' }),
            accessibilityLabel(label),
          ]}
        >
          {content}
        </HStack>
      )}
    </Host>
  );
}

const styles = StyleSheet.create({
  // Between the round controls: narrower rather than past the screen's edge.
  capsuleHost: { flexShrink: 1, minWidth: 0, height: size.mapControl },
  label: {
    color: color.onFab,
    textShadowColor: color.onGlassShadow,
    textShadowOffset: shadow.glyph.offset,
    textShadowRadius: shadow.glyph.radius,
  },
  // A layer shadow on a view without a fill follows the glyph's own shape.
  glyph: {
    shadowColor: color.onGlassShadow,
    shadowOpacity: 1,
    shadowOffset: shadow.glyph.offset,
    shadowRadius: shadow.glyph.radius,
  },
  circle: { width: size.mapControl, height: size.mapControl },
  chip: { height: size.mapControl, borderRadius: size.mapControl / 2, overflow: 'hidden' },
  chipPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xxs + 2,
    paddingHorizontal: space.sm,
  },
  chipLabel: { color: color.onSurface },
});
