import { Button, HStack, Host, Label } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  font,
  glassEffect,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { GlassView } from 'expo-glass-effect';
import { useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { color, motion, shadow, size, space } from '@/core/theme/tokens';

import { Icon } from './icon';
import { icons, type IconName } from './icons';
import type { CapsuleItem } from './map-controls';
import { Text } from './text';

export type { CapsuleItem } from './map-controls';

/** How far a control's text grows with the text size: the map's controls keep their place. */
const MAX_FONT_SCALE = 1.3;

/**
 * One half of the capsule. The whole glass answers a touch (interactive glass); the half under the
 * finger lights up at once and fades as it lifts, as a system glass toolbar's item does, so a press
 * on "+" never reads as one on "Meine Touren". Only light changes: nothing moves under Reduce Motion.
 */
function Segment({ item }: { item: CapsuleItem }) {
  const [lit] = useState(() => new Animated.Value(0));
  const fade = (to: number, duration: number) =>
    Animated.timing(lit, { toValue: to, duration, useNativeDriver: true }).start();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.label}
      accessibilityHint={item.hint}
      disabled={item.disabled}
      onPress={item.onPress}
      onPressIn={() => fade(1, 0)}
      onPressOut={() => fade(0, motion.medium)}
      hitSlop={{ top: 4, bottom: 4 }}
      style={[styles.segment, item.iconOnly && styles.iconOnly, item.disabled && styles.disabled]}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.lit, { opacity: lit }]}
      />
      <View style={styles.glyph}>
        <Icon name={item.icon} size={22} color={color.onFab} />
      </View>
      {item.iconOnly ? null : (
        // As a system toolbar's title: it grows with the text size only so far, then shrinks to
        // the room the row leaves it, so the controls beside it stay on screen.
        <Text
          variant="label"
          style={styles.label}
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {item.label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Liquid Glass over the map (D6), compact and tinted: the capsule of the map's main actions in
 * frosted glass tinted with the app's blue (as the PWA's bar; white glyphs on a soft shadow stay
 * legible over snow), the round controls beside it in faintly tinted glass with a blue glyph.
 * Real system glass samples the map and follows Reduce Transparency; interactive glass gives the
 * press its own feedback (no scaling of ours, so Reduce Motion has nothing to undo).
 */
export function GlassCapsule({ items, label }: { items: CapsuleItem[]; label: string }) {
  return (
    <GlassView
      isInteractive
      tintColor={color.fabGlass}
      style={styles.capsule}
      accessibilityRole="toolbar"
      accessibilityLabel={label}
    >
      {items.map((item, index) => (
        <View key={item.id} style={styles.segmentRow}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <Segment item={item} />
        </View>
      ))}
    </GlassView>
  );
}

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
    <GlassView isInteractive tintColor={color.glassTint} style={styles.circle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
        onPress={onPress}
        hitSlop={4}
        style={styles.circlePress}
      >
        <Icon name={icon} size={22} color={color.primary} />
      </Pressable>
    </GlassView>
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
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: size.mapControl,
    borderRadius: size.mapControl / 2,
    overflow: 'hidden',
    // Between the round controls: narrower rather than past the screen's edge.
    flexShrink: 1,
    minWidth: 0,
  },
  segmentRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 },
  divider: { width: StyleSheet.hairlineWidth * 2, height: 22, backgroundColor: color.onFabDivider },
  segment: {
    flexShrink: 1,
    minWidth: 0,
    height: size.mapControl,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  iconOnly: { width: size.mapControl + space.sm, paddingHorizontal: 0, flexShrink: 0 },
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
  lit: { backgroundColor: color.onGlassPressed },
  disabled: { opacity: 0.38 },
  circle: {
    width: size.mapControl,
    height: size.mapControl,
    borderRadius: size.mapControl / 2,
    overflow: 'hidden',
  },
  circlePress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
