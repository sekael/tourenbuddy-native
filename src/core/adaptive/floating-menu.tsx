import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { Animated, BackHandler, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, motion, radius, shadow, size, space } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import { Icon } from './icon';
import type { IconName } from './icons';
import { Text } from './text';

export type FloatingMenuItem = {
  id: string;
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Neighbours with the same section form a group; the iOS menu draws a separator between groups. */
  section?: string;
};

export type FloatingMenuProps = {
  /** Accessible name of the closed trigger, e.g. "Menu". */
  label: string;
  /** Accessible name of the open trigger, e.g. "Close menu". */
  closeLabel: string;
  /** The first item sits nearest the thumb, right above the button. */
  items: FloatingMenuItem[];
};

const native = Platform.OS !== 'web';
const ease = Easing.bezier(0.22, 0.7, 0.3, 1); // gentle deceleration, no overshoot

/**
 * Material 3 Expressive FAB menu (Android and web): a full-screen layer with the button in the
 * bottom-trailing corner, where the thumb rests. Items unfold upwards one after another; a tap
 * outside, Back (Android) or Escape (web) folds them away.
 */
export function FloatingMenu({ label, closeLabel, items }: FloatingMenuProps) {
  // `expanded` is what the user asked for; `mounted` keeps the items on screen while they fold away.
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const reducedMotion = useReducedMotion();
  // One timeline for all items: each starts `stagger` after the previous one.
  const span = motion.medium + motion.stagger * Math.max(items.length - 1, 0);

  const show = () => {
    setExpanded(true);
    setMounted(true);
    Animated.timing(progress, {
      toValue: 1,
      duration: reducedMotion ? 0 : span,
      easing: Easing.linear,
      useNativeDriver: native,
    }).start();
  };

  const hide = () => {
    setExpanded(false);
    Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : motion.short,
      easing: Easing.linear,
      useNativeDriver: native,
    }).start(({ finished }) => finished && setMounted(false));
  };

  // Leaving the screen (another tab, a sheet on top) folds the menu away at once, so it is closed
  // when the user comes back.
  useFocusEffect(
    useCallback(
      () => () => {
        progress.setValue(0);
        setExpanded(false);
        setMounted(false);
      },
      [progress],
    ),
  );

  const onDismissRequest = useEffectEvent(hide);

  useEffect(() => {
    if (!expanded) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismissRequest();
      return true;
    });
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onDismissRequest();
    if (!native) window.addEventListener('keydown', onKeyDown);
    return () => {
      back.remove();
      if (!native) window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  const itemStyle = (index: number) => {
    const start = (index * motion.stagger) / span;
    const p = progress.interpolate({
      inputRange: [start, start + motion.medium / span],
      outputRange: [0, 1],
      easing: ease,
      extrapolate: 'clamp',
    });
    const offset = reducedMotion ? 0 : motion.offset;
    return {
      opacity: p,
      transform: [
        { translateY: p.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) },
        { scale: p.interpolate({ inputRange: [0, 1], outputRange: [reducedMotion ? 1 : 0.9, 1] }) },
      ],
    };
  };

  const rotate = progress.interpolate({
    inputRange: [0, motion.medium / span],
    outputRange: ['0deg', '90deg'],
    easing: ease,
    extrapolate: 'clamp',
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {expanded && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={hide}
          accessible={false}
          tabIndex={-1}
        />
      )}
      <SafeAreaView
        edges={['bottom', 'left', 'right']}
        style={styles.anchor}
        pointerEvents="box-none"
      >
        <View style={styles.column} pointerEvents="box-none">
          {/* Button first: keyboard focus moves from it into the items. */}
          <Pressable
            role="button"
            aria-label={expanded ? closeLabel : label}
            aria-expanded={expanded}
            onPress={expanded ? hide : show}
            style={({ pressed }) => [styles.fab, pressed && !reducedMotion && styles.pressed]}
          >
            <Animated.View style={{ transform: [{ rotate }] }}>
              <Icon name={expanded ? 'close' : 'menu'} color={color.onFab} />
            </Animated.View>
          </Pressable>
          {mounted && (
            <View role="group" aria-label={label} style={styles.items}>
              {items.map((item, index) => (
                <Animated.View key={item.id} style={itemStyle(index)}>
                  <Pressable
                    role="button"
                    onPress={() => {
                      hide();
                      item.onPress();
                    }}
                    style={({ pressed }) => [
                      styles.item,
                      pressed && styles.itemPressed,
                      pressed && !reducedMotion && styles.pressed,
                    ]}
                  >
                    <Icon name={item.icon} color={color.onSecondaryContainer} />
                    <Text variant="label" style={styles.itemLabel}>
                      {item.label}
                    </Text>
                  </Pressable>
                </Animated.View>
              ))}
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: 0, bottom: 0, left: 0, alignItems: 'flex-end' },
  column: {
    flexDirection: 'column-reverse',
    margin: space.md,
    alignItems: 'flex-end',
    gap: space.xs,
  },
  items: { flexDirection: 'column-reverse', alignItems: 'flex-end', gap: space.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    height: size.fab,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    backgroundColor: color.secondaryContainer,
    boxShadow: shadow.md,
  },
  itemPressed: { backgroundColor: color.secondaryContainerPressed },
  itemLabel: { color: color.onSecondaryContainer },
  fab: {
    width: size.fab,
    height: size.fab,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.fab,
    boxShadow: shadow.lg,
  },
  pressed: { transform: [{ scale: motion.pressScale }] },
});
