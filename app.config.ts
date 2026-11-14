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
    // The team the association file names; without it a Simulator build has none and never matches.
    appleTeamId: 'R26MV7TAH3',
    supportsTablet: true,
    config: { usesNonExemptEncryption: false },
    // Passkeys for tourenbuddy.ch, which lists both apps in /.well-known/apple-app-site-association
    // (public/). Dev builds read that file from the domain instead of Apple's day-long CDN cache.
    associatedDomains: [
      `webcredentials:tourenbuddy.ch${prod ? '' : '?mode=developer'}`,
      // Universal Links (deep-links): notification links and app paths on tourenbuddy.ch.
      `applinks:tourenbuddy.ch${prod ? '' : '?mode=developer'}`,
    ],
    // Privacy manifest (D4): no tracking; what the account holds, linked to the user, for the app's
    // function only (#346 section 9). Expo merges the plugins' own manifests into it. The API
    // reasons: user defaults, file timestamps and boot time are React Native's own
    // (`scripts/cocoapods/privacy_manifest_utils.rb`); disk space is the outbox's and the offline
    // maps' free-space check (`Paths.availableDiskSpace`).
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyCollectedDataTypes: [
        'EmailAddress',
        'Name',
        'PhoneNumber',
        'Contacts',
        'PhotosorVideos',
        'OtherUserContent',
        'DeviceID',
      ].map((type) => ({
        NSPrivacyCollectedDataType: `NSPrivacyCollectedDataType${type}`,
        NSPrivacyCollectedDataTypeLinked: true,
        NSPrivacyCollectedDataTypeTracking: false,
        NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
      })),
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
      ],
    },
    infoPlist: {
      // WhatsApp from a contact (contact-phone): `canOpenURL` needs the scheme declared.
      LSApplicationQueriesSchemes: ['whatsapp'],
      // The file picker offers `.gpx` (Files): GPX is not a system type, so it is declared here.
      UTImportedTypeDeclarations: [
        {
          UTTypeIdentifier: 'com.topografix.gpx',
          UTTypeDescription: 'GPS Exchange Format',
          UTTypeConformsTo: ['public.xml'],
          UTTypeTagSpecification: {
            'public.filename-extension': ['gpx'],
            'public.mime-type': ['application/gpx+xml'],
          },
        },
      ],
    },
  },
  // Usage strings in both languages (Phase 4): InfoPlist.strings per locale.
  locales: {
    en: './assets/locales/ios/en.json',
    de: './assets/locales/ios/de.json',
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
      // The system contact picker needs no Contacts permission; the app uses no location or
      // microphone (#346 section 1, "Out of scope").
      'android.permission.READ_CONTACTS',
      'android.permission.WRITE_CONTACTS',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.RECORD_AUDIO',
      ...(prod ? ['android.permission.SYSTEM_ALERT_WINDOW'] : []),
    ],
  },
  web: {
    output: 'single',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    // One web bundle, not a chunk per route: a sheet opened after the connection drops must still
    // load (the web keeps no offline copy, D8, but what it shows stays usable).
    ['expo-router', { asyncRoutes: { web: false } }],
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
    // The native map (D6) and the offline database (D9).
    '@maplibre/maplibre-react-native',
    'expo-sqlite',
    'expo-sharing',
    // Push (D11): the APNs entitlement; the environment follows the signing profile.
    ['expo-notifications', { color: '#2563eb' }],
    // The system contact picker runs out of process and needs no Contacts permission; `false`
    // drops the plugin's NSContactsUsageDescription (Android: blockedPermissions above).
    ['expo-contacts', { contactsPermission: false }],
    // Photo attachments: the usage strings are localized through `locales` above.
    [
      'expo-image-picker',
      {
        photosPermission: 'TourenBuddy adds the photos you choose to a tour as attachments.',
        cameraPermission: 'TourenBuddy takes a photo to attach to a tour.',
        microphonePermission: false,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
