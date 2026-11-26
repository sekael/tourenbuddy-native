import type { ReactNode } from 'react';
import {
  ImageBackground,
  ScrollView,
  StatusBar,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/core/adaptive/text';
import { color, radius, shadow, size, space, textShadow } from '@/core/theme/tokens';

const portrait = require('../../../../assets/images/sign-in-portrait.webp');
const landscape = require('../../../../assets/images/sign-in-landscape.webp');

// The PWA's `<picture>` switches photos at this width.
const PORTRAIT_MAX_WIDTH = 768;
/** The product name is a logo more than text: it grows with Dynamic Type only so far. */
const BRAND_SCALE = 1.3;

type AuthHeroProps = { title: string; subtitle: ReactNode; children: ReactNode };

/**
 * A sign-in screen: the PWA's photo behind a darkening gradient, the product name, and the form on
 * an opaque card. The scroll view is as tall as its content, in the middle of the safe area: content
 * that fits never scrolls or bounces; taller content (a small phone, large text) scrolls within
 * the safe area. The keyboard insets the scroll view natively, in the
 * keyboard's own animation, and brings a hidden focused field into view: the form never lays out
 * again, so moving between the fields (a secure one swaps the keyboard) never makes it jump or cuts
 * the card off. Dragging it dismisses the keyboard. The status bar turns light over the photo while
 * the screen is shown.
 */
export function AuthHero({ title, subtitle, children }: AuthHeroProps) {
  const narrow = useWindowDimensions().width <= PORTRAIT_MAX_WIDTH;
  const insets = useSafeAreaInsets();

  return (
    <ImageBackground source={narrow ? portrait : landscape} resizeMode="cover" style={styles.fill}>
      <StatusBar barStyle="light-content" />
      <View style={styles.scrim} />
      {/* Within the safe area: scrolled, the card never passes under the clock over the photo. */}
      <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <ScrollView
          style={styles.scroll}
          // iOS keeps content that reaches the navigation bar (Create account, the code) clear of
          // it itself.
          contentInsetAdjustmentBehavior="automatic"
          automaticallyAdjustKeyboardInsets
          alwaysBounceVertical={false}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* The product name, whole on one line: at the largest text sizes it shrinks rather
              than break inside the word. */}
          <Text
            variant="display"
            role="heading"
            style={styles.brand}
            numberOfLines={1}
            adjustsFontSizeToFit
            maxFontSizeMultiplier={BRAND_SCALE}
          >
            TourenBuddy
          </Text>
          <View style={styles.card}>
            <Text variant="title" role="heading" level={2}>
              {title}
            </Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {children}
          </View>
        </ScrollView>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundImage: color.scrim },
  center: { flex: 1, justifyContent: 'center' },
  // As tall as the content, up to the screen (Android: the screen above the keyboard).
  scroll: { flexGrow: 0 },
  content: {
    alignItems: 'center',
    gap: space.lg,
    padding: space.xl,
  },
  brand: {
    color: color.onContrast,
    ...textShadow,
  },
  card: {
    width: '100%',
    maxWidth: size.form,
    gap: space.md,
    padding: space.xl,
    borderRadius: radius.lg,
    backgroundColor: color.background,
    boxShadow: shadow.md,
  },
  subtitle: { color: color.onSurfaceVariant },
});
