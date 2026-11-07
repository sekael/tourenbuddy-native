# Proposal

## Why

`add-app-foundation` left one empty screen. Every feature port needs the app's frame first: how
the user moves between places, the platform design language (M2 in sekael/tourenbuddy_frontend_vue#346),
the brand colors and type, icons, and a sheet to present each destination in. The owner decided
the app navigation on 2026-11-07: a **Map · Calendar** tab bar, with everything else behind a menu
that is easy to reach with the thumb when the phone is used one-handed.

## What Changes

- **App navigation:** a system tab bar with Map and Calendar (Liquid Glass on iOS, the Material 3
  navigation bar on Android). Web has no system tab bar, so it gets a Material 3 navigation bar on
  phones and a navigation rail from 600 px, which gives desktop windows a side layout instead of a
  stretched phone (D8).
- **Main menu in the thumb zone:** a floating button in the bottom-trailing corner of both tabs. iOS
  shows the system menu out of a Liquid Glass button; Android and web show a Material 3 Expressive
  FAB menu whose items unfold one after another. Its entries (Inbox, Contacts, Profile, Feedback)
  open their destination as a sheet above the tabs. Map layers and offline maps join the menu with
  the map port.
- **Sheets:** the system sheet sized to its content on iOS (Liquid Glass at partial height) and
  Android (Material bottom sheet). Web: a bottom sheet on phones, a content-sized dialog hanging
  from the top from 600 px. Closing returns to the tab it was opened from; a link straight to a
  destination puts the map beneath it.
- **Design tokens (D12):** the Vue app's colors as typed semantic roles over a primitive palette,
  light only, every text pair checked against WCAG AA; spacing, radius, type scale, motion, sizes
  and breakpoints.
- **Fonts (D11):** iOS uses the system font. Android embeds Inter at build time; web loads a 48 KB
  Inter subset from its own origin. No runtime font downloads from third parties.
- **Icons (D11):** one registry maps each icon to an SF Symbol (iOS) and a Material Symbols path
  (Android and web, drawn as SVG), so icons render in the first frame without loading a font.
- **Placeholders:** the Map and Calendar tabs and the four menu destinations show placeholders until
  their features are ported in Phase 3.
- **Tests:** Jest runs as iOS by default, Material components and navigation as Android, and
  web-only behavior in a browser environment.

Deferred to the change that first needs them (D5: only components the app uses):

- Text buttons and the confirm dialog: `add-auth-session` (sign-in) and the profile port.
- The desktop side panel for browse sheets (`side-drawer`, D8): the tours port, with the tour list.
- A native Compose FAB menu (#346 R12): Android polish in Phase 4, if the JavaScript menu falls
  short of Material 3 Expressive on a device.
- The iPad sidebar, a themed Android icon, dark mode (D12).

## Capabilities

### New Capabilities

- `app-navigation`: the tabs, the main menu and how menu destinations open and close.

### Modified Capabilities

- `design-system`: color roles, typography and icons per platform, glass on floating controls, and
  the two token tiers as typed values instead of CSS custom properties. The other requirements stay
  as they are until their features are ported.
- `responsive-overlay`: overlays use the platform's sheet, and how each platform closes them.

## Impact

- Repository `sekael/tourenbuddy-native`, branch `feat/368-adaptive-ui`.
- New dependencies (`npx expo install`): `@expo/ui`, `expo-symbols`, `expo-font`,
  `@expo-google-fonts/inter`, `react-native-svg`; dev: `@testing-library/react`,
  `@testing-library/dom`.
- New asset `assets/fonts/inter-latin-variable.woff2` (SIL Open Font License, `OFL.txt` beside it).
- Native config changes (Inter on Android): run `npm install` and `npx expo prebuild --clean`
  before the next dev build.
- No backend change.
