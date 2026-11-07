import type { ConfigContext, ExpoConfig } from 'expo/config';

import { version } from './package.json';

// Anything but APP_VARIANT=prod builds the dev identity, so a local build never takes the store
// identity by accident. Switching variants changes the bundle id: run `npx expo prebuild --clean`.
const prod = process.env.APP_VARIANT === 'prod';
const id = prod ? 'ch.tourenbuddy.app' : 'ch.tourenbuddy.app.dev';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: prod ? 'TourenBuddy' : 'TourenBuddy Dev',
  slug: 'tourenbuddy',
  version,
  scheme: prod ? 'tourenbuddy' : 'tourenbuddy-dev',
  icon: './assets/images/icon.png',
  // D12: light only at launch. Same white as the launch screen, so launch hands over without a flash.
  userInterfaceStyle: 'light',
  backgroundColor: '#ffffff',
  ios: {
    bundleIdentifier: id,
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: id,
    adaptiveIcon: {
      foregroundImage: './assets/images/icon.png',
      backgroundColor: '#ffffff',
    },
    predictiveBackGestureEnabled: true,
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { image: './assets/images/splash-icon.png', imageWidth: 160, backgroundColor: '#ffffff' },
    ],
    // Per-app language in system settings. "de" covers every German region; the app maps it to de-CH.
    ['expo-localization', { supportedLocales: ['en', 'de'] }],
    ['expo-build-properties', { ios: { deploymentTarget: '26.0' } }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
