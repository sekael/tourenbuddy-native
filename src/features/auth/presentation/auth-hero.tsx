import type { ReactNode } from 'react';
import {
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
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

type AuthHeroProps = { title: string; subtitle: ReactNode; children: ReactNode };

/**
 * A sign-in screen: the PWA's photo behind a darkening gradient, the product name, and the form on
 * an opaque card. iOS pads the screen by the keyboard with the keyboard's own animation, and the
 * content scrolls when it does not fit (small phones); dragging it dismisses the keyboard. The status
 * bar turns light over the photo while the screen is shown.
 */
export function AuthHero({ title, subtitle, children }: AuthHeroProps) {
  const narrow = useWindowDimensions().width <= PORTRAIT_MAX_WIDTH;
  const insets = useSafeAreaInsets();

  return (
    <ImageBackground source={narrow ? portrait : landscape} resizeMode="cover" style={styles.fill}>
      <StatusBar barStyle="light-content" />
      <View style={styles.scrim} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          // iOS keeps the content clear of the status bar, the navigation bar and the home
          // indicator itself; elsewhere the safe area pads it.
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.content,
            Platform.OS !== 'ios' && {
              paddingTop: insets.top + space.xl,
              paddingBottom: insets.bottom + space.xl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Text variant="display" role="heading" style={styles.brand}>
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
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrim: { ...StyleSheet.absoluteFill, backgroundImage: color.scrim },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
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
