import { router, type NativeStackNavigationOptions } from 'expo-router';
import {
  type ComponentRef,
  type ReactElement,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Easing, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { color, motion, radius, shadow, size, space } from '@/core/theme/tokens';
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

/**
 * Web: the map's sheets, steps and forms sit in a panel beside the live map (D4), drawn by
 * `sheetLayout`. The panel's height on a phone is the iOS sheet's first detent.
 */
const panelOptions: NativeStackNavigationOptions = {
  presentation: 'containedTransparentModal',
  headerShown: false,
  animation: 'none',
  contentStyle: { backgroundColor: 'transparent' },
};
export const mapSheetOptions: NativeStackNavigationOptions = {
  ...panelOptions,
  sheetAllowedDetents: [0.5],
};
export const stepSheetOptions: NativeStackNavigationOptions = {
  ...panelOptions,
  sheetAllowedDetents: [0.45],
};
export const formModalOptions = panelOptions;

/**
 * The stack's screen layout: a panel route's content in a side panel from 600 px, a bottom sheet
 * on phones. The route still covers the window, so everything around the panel lets clicks
 * through to the map; Escape is the page's own close (`Page`).
 */
export function sheetLayout({
  options,
  children,
}: {
  options: NativeStackNavigationOptions;
  children: ReactElement;
}) {
  if (options.presentation !== 'containedTransparentModal') return children;
  const detents = options.sheetAllowedDetents;
  return <Panel height={Array.isArray(detents) ? detents[0]! : 1}>{children}</Panel>;
}

function Panel({ height, children }: { height: number; children: ReactElement }) {
  const compact = useBreakpoint() === 'compact';
  const panel = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    const node = panel.current as unknown as HTMLElement | null;
    // Up to the route's own element, the one beside the other routes.
    for (let el = node?.parentElement; el; el = el.parentElement) {
      el.style.pointerEvents = 'none';
      if ((el.parentElement?.childElementCount ?? 0) > 1) break;
    }
    node?.focus();
  }, []);

  return (
    <View
      ref={panel}
      tabIndex={-1}
      style={[styles.sidePanel, compact && [styles.bottomPanel, { height: `${height * 100}%` }]]}
    >
      {children}
    </View>
  );
}

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
  // A full-height drawer over the navigation rail, as a sheet covers the tab bar on iOS.
  sidePanel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: size.panel,
    backgroundColor: color.background,
    boxShadow: shadow.lg,
    outlineWidth: 0,
    pointerEvents: 'auto',
  },
  bottomPanel: {
    top: 'auto',
    left: 0,
    right: 0,
    bottom: 0,
    width: 'auto',
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    overflow: 'hidden',
  },
});
