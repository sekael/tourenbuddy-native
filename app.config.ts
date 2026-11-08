import type { ConfigContext, ExpoConfig } from 'expo/config';

import { version } from './package.json';

// Anything but APP_VARIANT=prod builds the dev identity, so a local build never takes the store
// identity by accident. Switching variants changes the bundle id: run `npx expo prebuild --clean`.
const prod = process.env.APP_VARIANT === 'prod';
const id = prod ? 'ch.tourenbuddy.app' : 'ch.tourenbuddy.app.dev';

const interFaces = (
  [
    ['400Regular', 400],
    ['500Medium', 500],
    ['600SemiBold', 600],
  ] as const
).map(([face, weight]) => ({
  path: `./node_modules/@expo-google-fonts/inter/${face}/Inter_${face}.ttf`,
  weight,
}));

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
    // Passkeys for tourenbuddy.ch, which lists both apps in /.well-known/apple-app-site-association
    // (public/). Dev builds read that file from the domain instead of Apple's day-long CDN cache.
    associatedDomains: [`webcredentials:tourenbuddy.ch${prod ? '' : '?mode=developer'}`],
  },
  android: {
    package: id,
    adaptiveIcon: {
      foregroundImage: './assets/images/icon.png',
      backgroundColor: '#ffffff',
    },
    predictiveBackGestureEnabled: true,
    // expo-file-system's plugin asks for these; the app only uses its own files. The template's
    // "display over other apps" serves React Native's dev overlays, so only dev builds keep it.
    // What release builds declare is reviewed against permissions.json.
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      ...(prod ? ['android.permission.SYSTEM_ALERT_WINDOW'] : []),
    ],
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
    // The session lives in the Keychain and Keystore; no biometrics, so no Face ID usage string.
    ['expo-secure-store', { faceIDPermission: false }],
    // D11: Inter on Android, embedded at build time so the first frame already uses it. iOS uses
    // the system font; web loads Inter at startup (src/core/theme/load-fonts.web.ts).
    ['expo-font', { android: { fonts: [{ fontFamily: 'Inter', fontDefinitions: interFaces }] } }],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
