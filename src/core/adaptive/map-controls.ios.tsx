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
import { Pressable, StyleSheet, View } from 'react-native';

import { color, shadow, size, space } from '@/core/theme/tokens';

import { Icon } from './icon';
import { icons, type IconName } from './icons';
import type { CapsuleItem } from './map-controls';
import { Text } from './text';

export type { CapsuleItem } from './map-controls';

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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityHint={item.hint}
            disabled={item.disabled}
            onPress={item.onPress}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[
              styles.segment,
              item.iconOnly && styles.iconOnly,
              item.disabled && styles.disabled,
            ]}
          >
            <View style={styles.glyph}>
              <Icon name={item.icon} size={22} color={color.onFab} />
            </View>
            {item.iconOnly ? null : (
              <Text variant="label" style={styles.label} numberOfLines={1}>
                {item.label}
              </Text>
            )}
          </Pressable>
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
  },
  segmentRow: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: StyleSheet.hairlineWidth * 2, height: 22, backgroundColor: color.onFabDivider },
  segment: {
    height: size.mapControl,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  iconOnly: { width: size.mapControl + space.sm, paddingHorizontal: 0 },
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
  disabled: { opacity: 0.38 },
  circle: {
    width: size.mapControl,
    height: size.mapControl,
    borderRadius: size.mapControl / 2,
    overflow: 'hidden',
  },
  circlePress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
