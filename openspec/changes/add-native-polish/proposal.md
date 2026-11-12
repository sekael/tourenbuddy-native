# Proposal

## Why

Phase 4 (sekael/tourenbuddy_frontend_vue#371) makes the ported app feel native and meet the design
requirement (#346 section 5) and the store rules (section 9): links open the app, old versions can
be stopped, permissions are asked only when needed, files and other apps work as on the platform,
every size and setting is respected, and the build carries what the stores check. Bundled with
Phase 3 at the owner's request (2026-11-09).

## What Changes

- **Deep links, one resolver:** Universal Links on `tourenbuddy.ch` (iOS), App Links (Android),
  the app's scheme and a tapped push all go through one function that maps a URL to a route; the
  PWA's `/?notification=<id>` opens the inbox entry's target and marks it read.
- **Updates:** `app-update` rewritten for stores: a forced-update gate read from
  `https://tourenbuddy.ch/app-config.json` (#346 D15, B5) blocks a version below the platform's
  minimum with a link to the store; offline or an unreachable file never blocks. The version line
  stays in Profile. The PWA's service-worker prompt is retired (`pwa-support` removed).
- **Permissions:** push only on opt-in (Phase 3), photo library and camera usage strings in English
  and German, no Contacts or location permission (`blockedPermissions` on Android).
- **Files and other apps:** GPX declared as an imported type so the file picker offers `.gpx`;
  `LSApplicationQueriesSchemes` for WhatsApp; Android `<queries>` for dial, SMS, mail and WhatsApp.
- **Form factors:** iPad and rotation without an orientation lock, the desktop side panel on the
  web, the keyboard never covering a focused field.
- **Accessibility:** labels and hints on every map control, VoiceOver order over the map, Dynamic
  Type up to the largest accessibility sizes in both locales, Reduce Motion, Reduce Transparency and
  Increase Contrast respected by every custom view.
- **Compliance in the build:** `PrivacyInfo.xcprivacy` for the app (required-reason APIs, collected
  data, no tracking), `ITSAppUsesNonExemptEncryption = NO` (Phase 1), Android target API 36,
  16 KB page alignment checked.
- **Icons and launch:** the iOS icon as an Icon Composer document (`ios.icon`, light, dark and
  tinted appearances), the Android adaptive icon with a monochrome layer for themed icons, the launch
  screen through the splash-screen plugin (Android's SplashScreen API), held until the session is
  known (Phase 1). The artwork itself is the owner's (D14).
- **Performance:** cold start without blocking work (fonts embedded, stores hydrate after the first
  frame, marker images drawn once), map chrome measured under panning on the iPhone 15, no memory
  growth over a long session (map images and listeners released), Realtime closed in the background
  (Phase 1).
- **Web:** every control reachable and operable by keyboard with visible focus, semantic roles and
  labels, Escape closes sheets (Phase 1), the desktop side panel.
- **Manual test plan:** `docs/manual-test-plan.md` with the cases for this pull request (Phases 2 to
  4) on the iOS Device Hub (Simulator) and the real iPhone 15, each with steps and the expected
  result, extending #346 section 12.
- **Glass exceptions:** `docs/glass-exceptions.md` lists every surface that is not real Liquid
  Glass, with the reason, for the owner to approve or reject.

## Capabilities

### New Capabilities

- `deep-links`: one resolver for every way into the app.
- `app-compliance`: what the build declares for the stores.

### Modified Capabilities

- `app-update`: store updates and the forced-update gate.
- `pwa-support`: retired on native and web (removed).

## Impact

- `src/core/links/`, `src/app/+native-intent.tsx`, `src/core/update/`, `app.config.ts`
  (associated domains, intent filters, privacy manifest, usage strings, queries, imported types),
  `public/.well-known/` (`add-public-pages`), `docs/glass-exceptions.md`, `docs/manual-test-plan.md`.
- Owner: Icon Composer artwork and Android monochrome icon (design assets), Play App Signing
  SHA-256 for `assetlinks.json` after the first Play upload, 16 KB check with `bundletool`, the
  Worker's `APP_URL` switched to `https://tourenbuddy.ch` once the web app is live there (Phase 7;
  until then email links open the PWA on `test.tourenbuddy.ch`, push taps never leave the app).
