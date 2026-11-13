import { Pressable, StyleSheet, View } from 'react-native';

import { color, motion, radius, shadow, size, space, strong } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import { Icon } from './icon';
import type { IconName } from './icons';
import { Text } from './text';

/**
 * Floating controls over the map (#346 section 5, "Map floating buttons"): a capsule of actions
 * and a round button. Android and the web draw Material 3 floating controls; iOS draws Liquid Glass
 * (`map-controls.ios.tsx`).
 */
export type CapsuleItem = {
  id: string;
  label: string;
  icon: IconName;
  /** Icon only (the label becomes the accessible name). */
  iconOnly?: boolean;
  /** What a press does, when the label does not say it (VoiceOver and TalkBack read it last). */
  hint?: string;
  onPress: () => void;
  disabled?: boolean;
};

export function GlassCapsule({ items, label }: { items: CapsuleItem[]; label: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <View role="toolbar" aria-label={label} style={styles.capsule}>
      {items.map((item, index) => (
        <View key={item.id} style={styles.segmentRow}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <Pressable
            role="button"
            aria-label={item.label}
            accessibilityHint={item.hint}
            disabled={item.disabled}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.segment,
              pressed && styles.pressed,
              pressed && !reducedMotion && styles.scaled,
              item.disabled && styles.disabled,
            ]}
          >
            <Icon name={item.icon} color={color.onFab} />
            {item.iconOnly ? null : (
              <Text variant="label" style={styles.label}>
                {item.label}
              </Text>
            )}
          </Pressable>
        </View>
      ))}
    </View>
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
  const reducedMotion = useReducedMotion();
  return (
    <Pressable
      role="button"
      aria-label={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [styles.circle, pressed && !reducedMotion && styles.scaled]}
    >
      <Icon name={icon} color={color.onSecondaryContainer} />
    </Pressable>
  );
}

/** A status capsule over the app (offline, syncing); a button only when it leads somewhere. */
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
  const tint = warning ? color.error : color.onSurface;
  return (
    <Pressable
      role={onPress ? 'button' : 'status'}
      aria-label={label}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.status, pressed && styles.statusPressed]}
    >
      <Icon name={icon} color={tint} size={16} />
      <Text variant="caption" style={[strong, { color: tint }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.fab,
    borderRadius: radius.pill,
    boxShadow: shadow.md,
    overflow: 'hidden',
  },
  segmentRow: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: 1, height: 24, backgroundColor: color.onFabDivider },
  segment: {
    minHeight: size.fab,
    minWidth: size.fab,
    paddingHorizontal: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  label: { color: color.onFab },
  pressed: { backgroundColor: color.primary },
  scaled: { transform: [{ scale: motion.pressScale }] },
  disabled: { opacity: 0.38 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    boxShadow: shadow.md,
  },
  statusPressed: { backgroundColor: color.surfaceVariant },
  circle: {
    width: size.fab,
    height: size.fab,
    borderRadius: radius.pill,
    backgroundColor: color.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: shadow.md,
  },
});
