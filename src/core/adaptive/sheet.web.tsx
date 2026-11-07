import { router, type NativeStackNavigationOptions } from 'expo-router';
import { type ComponentRef, useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { color, motion, radius, shadow, space } from '@/core/theme/tokens';
import { useBreakpoint } from '@/core/theme/use-breakpoint';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';

import type { SheetProps } from './sheet';
import { SheetHeader } from './sheet-header';

export type { SheetProps } from './sheet';

/** Web: the route keeps the screen beneath visible and draws its own overlay. */
export const sheetOptions: NativeStackNavigationOptions = {
  presentation: 'transparentModal',
  headerShown: false,
  animation: 'none',
};

const ease = Easing.bezier(0.22, 0.7, 0.3, 1);

/**
 * Web sheet: a bottom sheet on phones, from 600 px a content-sized dialog hanging from the top.
 * Escape, the backdrop and the close button glide it out before the route closes.
 */
export function Sheet({ title, children }: SheetProps) {
  const { t } = useTranslation();
  const compact = useBreakpoint() === 'compact';
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  const closing = useRef(false);
  const panel = useRef<ComponentRef<typeof View>>(null);
  const titleId = useId();

  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(progress, {
      toValue: 0,
      duration: reducedMotion ? 0 : motion.short,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start(() => (router.canGoBack() ? router.back() : router.replace('/')));
  };

  useEffect(() => {
    panel.current?.focus();
    Animated.timing(progress, {
      toValue: 1,
      duration: reducedMotion ? 0 : motion.medium,
      easing: ease,
      useNativeDriver: false,
    }).start();
  }, [progress, reducedMotion]);

  const onEscape = useEffectEvent(dismiss);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onEscape();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A desktop dialog hangs from a fixed top inset (as in the Vue app), so it never jumps when its
  // content changes height; the same inset stays free below.
  const inset = Math.min(Math.max(space.xl, height * 0.12), 112);

  const panelMotion = compact
    ? {
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) },
        ],
      }
    : {
        opacity: progress,
        transform: [
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
        ],
      };

  return (
    <View
      style={[
        styles.overlay,
        compact ? styles.atBottom : [styles.hanging, { paddingVertical: inset }],
      ]}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          aria-label={t('common.close')}
          tabIndex={-1}
        />
      </Animated.View>
      <Animated.View
        ref={panel}
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        tabIndex={-1}
        style={[styles.panel, compact ? styles.bottomSheet : styles.dialog, panelMotion]}
      >
        <SheetHeader title={title} titleId={titleId} onClose={dismiss} />
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1 },
  atBottom: { justifyContent: 'flex-end' },
  hanging: { alignItems: 'center', paddingHorizontal: space.xl },
  backdrop: { backgroundColor: color.backdrop },
  panel: {
    backgroundColor: color.background,
    padding: space.xl,
    boxShadow: shadow.lg,
    outlineWidth: 0,
  },
  bottomSheet: {
    maxHeight: '90%',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space.xxl,
  },
  dialog: { width: '100%', maxWidth: 560, maxHeight: '100%', borderRadius: radius.lg },
});
