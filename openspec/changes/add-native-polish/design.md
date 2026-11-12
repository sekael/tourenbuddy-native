# Design

## Decisions

### D1: One URL resolver

`core/links/resolve.ts` maps any incoming URL to a route: `https://tourenbuddy.ch/...`,
`https://test.tourenbuddy.ch/...` (the Worker's current `APP_URL`), `tourenbuddy://` and
`tourenbuddy-dev://`. `/?notification=<id>` → `/inbox?open=<id>` (the inbox store marks it read
and replaces the route with the entry's own target, as the PWA's `use-inbox-navigation` did); known
app paths pass through; anything else → `/`. Expo Router calls it from `+native-intent.tsx` for
links and cold starts; the push tap handler (Phase 3) calls the same function with the payload's
`url`. Pure function, tested with every shape.

Universal Links need the `applinks` entry in `tourenbuddy.ch`'s association file (`add-public-pages`)
and `applinks:tourenbuddy.ch` in `associatedDomains`, with `?mode=developer` in dev builds as for
`webcredentials` (Phase 1), so Simulator builds read the file from the domain instead of Apple's CDN. `test.tourenbuddy.ch` serves the PWA and is
left alone until cutover (Phase 7), so emails link there open the PWA; push taps never leave the app.

### D2: Forced-update gate

`app-config.json`: `{"min_supported_ios":"0.1.0","min_supported_android":"0.1.0"}`. On start and on
every return to the foreground (at most every 15 minutes) the app fetches it (5 s bound), keeps the
last good answer in the key-value store, and compares the app's version (`expo-application`) by
semver. Below the minimum: a full-screen, non-dismissible screen with "Update" opening the store page.
Fetch failure, offline, or a malformed file: the last good answer, else no gate. The web never
gates (it is always current); it reloads on a new deploy as before (out of scope: the PWA's prompt).

### D3: Usage strings and permissions

`expo-image-picker` plugin: photo and camera strings; localized through `app.config.ts`'s `locales`
(`assets/locales/ios/{en,de}.json` → `InfoPlist.strings`). No microphone (`microphonePermission:
false`). Android `blockedPermissions` adds `READ_CONTACTS`, `ACCESS_*_LOCATION`, `RECORD_AUDIO`.
`expo-contacts`' picker needs none of them.

Android target API: 36, SDK 58's default (`expo-modules-core`), with no override. It meets Google
Play's current requirement for new apps and updates; #346 suggests 37 early, but forcing it ahead
of the SDK risks untested library behavior. Raise it with the Expo SDK that defaults to 37, before
Play requires it (expected August 2027).

### D4: Privacy manifest

`ios.privacyManifests` in `app.config.ts`: `NSPrivacyTracking` false, no tracking domains;
collected data types email, name, phone, other user content, photos, device id (push token), all
linked, app functionality only; required-reason APIs: UserDefaults `CA92.1`, file timestamps
`C617.1`, system boot time `35F9.1`, disk space `E174.1` (offline maps check free space). Expo
merges the plugins' own manifests.

### D5: Accessibility

Every map control has a label and hint; the glass capsule and circles are buttons in reading order
after the map; the map itself is one element ("Map, double-tap to explore") so VoiceOver does not walk
thousands of features. Custom views read `useReducedMotion` and `AccessibilityInfo`'s Reduce
Transparency (solid fills instead of translucent ones) and Bold Text.

### D6: Icons and launch

`ios.icon` points at an Icon Composer document (`assets/app.icon`) once the owner exports it; until
then the current PNG stays. Android `adaptiveIcon` gains `monochromeImage` for themed icons. The
launch screen stays the splash-screen plugin (white, the mark), which on Android 12+ is the
SplashScreen API.

### D7: Performance

Measured by the owner (#346 R14, R15) with Instruments on the iPhone 15: cold start to the first
map frame, hitches while panning under the chrome with a sheet open, memory over a 30-minute session.
In code: no work before the first frame beyond session restore; marker images drawn once and kept;
every Realtime subscription and listener ended on `clear()`; the map's `onRegionDidChange` is the
only camera event the store reads (no per-frame state).

### D8: Web keyboard and semantics

Every custom control on the web has a role, a label and visible focus; lists are lists; the map
controls are buttons. Phase 1's overlay sheets trap focus and close on Escape. The map's sheets,
steps and forms are a panel beside the live map (port-app-features D4): a full-height panel from
600 px, a bottom sheet on phones, the map around it still taking clicks; focus moves into the panel
and Escape runs its page's Back, Close or Cancel (a form's Cancel still asks before discarding).
React Native Web's `Alert.alert` does nothing, so the browser's dialogs stand in for it. Checked
with the keyboard on the core flow.

### D9: Manual test plan

`docs/manual-test-plan.md`: setup (backend with Phase 2 applied, two accounts, Simulator in Device
Hub, iPhone 15), then cases grouped by area with ID, steps, expected result and where to run them
(Simulator, iPhone 15, both). It covers this pull request's three phases and points at #346
section 12 for the release-wide matrix.

### D10: Glass exceptions

`docs/glass-exceptions.md` lists, per #346 section 5's table, what is real glass and what is not,
with the reason: the month grid and seasons chart (content), the elevation profile (content),
coach marks (a dimming layer, not chrome), Android and web (Material by design).
