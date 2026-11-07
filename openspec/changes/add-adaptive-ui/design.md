# Design

## Context

`main` has the foundation: Expo SDK 58, Expo Router with routes in `src/app`, i18next, the logger
and one placeholder screen. The S1 spike (`spike/route-gate`) already ran `NativeTabs` with Map and
Calendar over a MapLibre map, a `formSheet` with detents and a glass menu, and the owner checked
them on iOS 26. Expo UI in SDK 58 wraps SwiftUI (glass button styles, `Menu`) and Jetpack Compose
(FABs, but no FAB menu). Agents cannot run the native apps; Jest, the web export and the generated
native projects are what can be checked here.

## Goals / Non-Goals

**Goals:**

- The frame every feature port plugs into: tabs, menu, sheets, tokens, fonts, icons.
- Real platform components wherever they exist, so iOS gets system glass, haptics and VoiceOver
  behavior for free.
- Nothing that renders late: fonts and icons are in place in the first frame on native.

**Non-Goals:**

- Components without a consumer yet (buttons, confirm dialog, side panel; see the proposal).
- The map, calendar and every destination's content (Phase 3).
- Dark mode and the iPad sidebar.

## Decisions

### Tabs: the system tab bar on iOS and Android, headless tabs on web

- **iOS and Android:** `(tabs)/_layout.tsx` uses `NativeTabs` (stable in SDK 58): the Liquid Glass
  tab bar on iOS, the Material 3 navigation bar on Android. The system draws the selection and
  moves it between the places, and follows Reduce Transparency, Reduce Motion, VoiceOver and
  Dynamic Type.
- **Web:** no system tab bar, and the `NativeTabs` fallback is a basic iPad-like layout, so
  `(tabs)/_layout.web.tsx` uses the headless tabs with our own Material 3 navigation bar below
  600 px and a navigation rail from 600 px (Material's medium window class; the Vue app switched to
  desktop at 600 px too).
- **History, 2026-11-07, from the owner's Simulator rounds.** Round 1 ran this layout: the menu
  circle above the bar read detached and small, and the bar left ghost copies of the selected tab
  after Reduce Transparency was toggled, so the owner chose one glass row of our own. Rounds 2 to 4
  built it three times (SwiftUI, React Native over `expo-glass-effect`, SwiftUI with the entries as
  glass pills). The places did not switch on the device: the React Compiler reused the headless
  tabs' `NavigationContent` element, and Jest, which did not compile, passed. Once fixed for round 4,
  the row still did not move like system controls (no glide between the places, pills timed by React
  Native). The owner then asked to start over with real iOS components only and chose the system
  tab bar with a larger menu circle above it.

- **Alternative: the current sheet flow without tabs.** Rejected by the owner (2026-11-07): the
  calendar stays hidden behind an icon in the tours sheet, and the app forgoes the system tab bar.
- **Alternative: four tabs (Map, Calendar, Contacts, Inbox).** Rejected by the owner: contacts and
  inbox would become full screens instead of sheets over the map, more port work and spec changes.
- **Alternative on iOS: our own glass row** (the places centred in a capsule, the menu circle level
  beside it; rounds 2 to 4). Needs the headless tabs and a React Compiler opt-out, times the
  selection and the menu in our code instead of the system's, and gives up the bar's
  minimize-on-scroll. Replaced at the owner's request.
- **Alternative on iOS: a segmented control and the menu circle in one row of system controls.**
  Keeps the row, but a segmented control is not tab navigation to VoiceOver or the Human Interface
  Guidelines, and the system menu would open over it. Not chosen by the owner.
- **Alternative on iOS: a Menu tab in the bar's detached search slot.** iOS 26 places a search tab
  as a separate circle beside the bar, level with it, but a tab opens a page, not a menu; it relies
  on the search role, and the search tab truncates the other titles on first appearance
  (react-native-screens #5015). Not chosen by the owner.

### Root stack above the tabs

The root layout is a `Stack` holding `(tabs)` and the destination routes (`inbox`, `contacts`,
`profile`, `offline-maps`, `map-layers`, `feedback`) presented as sheets. A sheet opened from
either tab therefore covers the tab bar too, and `router.back()` returns to the tab it came from.
`unstable_settings.anchor = '(tabs)'` puts the tabs beneath a destination opened straight from a
link, so closing it lands on the map instead of nowhere.

### Main menu: the system menu on iOS, a FAB menu on Android and web

The owner asked for a menu that is easy to reach one-handed, with the Vue app's entries: Inbox,
Contacts, Profile, Offline maps, Map layers and Feedback, the first nearest the thumb. Offline maps
and map layers belong to the map, so they show on the Map tab only. `useMainMenuItems(tab)` in the
shell feature builds the list for both menus below; each tab's screen shows the menu.

- **iOS:** `floating-menu.ios.tsx` is an `@expo/ui` SwiftUI `Menu` in a Liquid Glass circle in the
  bottom-trailing corner, right above the tab bar: a tab's native safe area ends at the bar.
  `buttonStyle('glass')` with a circle shape, framed to 60 pt, FAB-sized and as tall as the bar
  (round 1's circle read small). The system menu morphs out of the glass with system haptics and
  VoiceOver, and opening upwards it lists the first item nearest the circle. The map's entries carry
  `section: 'map'`; neighbours with the same section become one SwiftUI `Section`, so the system
  draws separators around the map's group and none on the Calendar tab. No tint: the icons stay in
  the label color as in system menus. Expo's docs warn that `glassEffect()` on a menu label leaves
  a halo on dismiss, so the glass comes from `buttonStyle`.
- **Android and web:** `FloatingMenu`, a full-screen layer with its button in the bottom-trailing
  corner, above the navigation bar, on both tabs.
- **The FAB menu:** Expo UI has FABs but no FAB menu (#346 R12), so the Material 3 Expressive
  FAB menu is built in React Native: brand FAB, tonal pill items that unfold upwards one after
  another (opacity, 12 dp travel, 0.9 → 1 scale, 40 ms stagger, one animation timeline), the icon
  turning into a close mark. Tap outside, Back (Android) or Escape (web) folds it away. Android and
  web share the file. `react-native-reanimated` is not needed: `Animated` with the native driver
  covers opacity and transforms. The items are a labelled group of buttons rather than an ARIA
  `menu`, which would promise arrow-key navigation; the menu folds away at once when its screen
  loses focus (another tab, a sheet on top).
- `expanded` (what the user asked for) and `mounted` (items still on screen while they fold away)
  are separate states, so a second tap during the fold reopens the menu instead of closing it twice.
- **Alternative on iOS: the entries as separate glass pills rising from the circle** (round 4).
  Timed by React Native, they could not morph out of the circle's glass like the system menu, and
  on the device fewer pills showed with each opening. Replaced by the system menu.
- **Alternative: a native Compose FAB menu module.** Deferred to Phase 4 polish: Android is not the
  focus now (owner), and the JavaScript menu follows the same spec.

### Sheets: system sheets on native, an overlay route on web

`sheetOptions` and `Sheet` live in `src/core/adaptive/sheet.tsx` and `sheet.web.tsx`.

- **iOS and Android:** `presentation: 'formSheet'` with `sheetAllowedDetents: 'fitToContents'`.
  On iOS the content background stays transparent, so the system draws Liquid Glass at partial
  height; Android gets the Material bottom sheet on the app background. Android form sheets have
  no native header, so `Sheet` draws its own title row with a close button on every platform. The
  iOS close button is SwiftUI's `role="close"` button in glass (the system xmark); Android and web
  use a tonal round button. One detent, so no grabber.
- **Web:** Expo Router renders modal routes as plain stack routes on web and recommends
  `transparentModal` with a custom overlay. Below 600 px the sheet slides up from the bottom; from
  600 px it is a dialog up to 560 px wide, hanging from the Vue app's top inset
  (`clamp(24, 12 % of height, 112)`) so it never jumps when its content changes height. Escape, the
  backdrop and the close button glide it out first and then go back; a guard keeps a race of all
  three to one `router.back()`. It is a labelled `dialog` that takes focus when it opens.
- **Alternative: `@expo/ui` universal `BottomSheet`.** It is a component, not a route: the
  destination would not have a URL, and links and the back stack would need extra code.

### Tokens: typed values in two tiers

`src/core/theme/tokens.ts` maps the Vue `tokens.css` and `typography.css`: a private primitive
palette and exported semantic color roles, plus spacing, radius, type scale, sizes, motion, shadow
and breakpoints. Typed objects instead of CSS custom properties: a typo is a compile error, and
React Native has no cascade to override. Light only (D12). A test checks every text role on the
surface it is drawn on for WCAG AA 4.5:1, so a later palette edit cannot lower contrast unnoticed.

### Fonts: system on iOS, Inter embedded on Android, a small subset on web

- **iOS:** the system font (D11); `fontFamily` stays unset.
- **Android:** the `expo-font` config plugin embeds Inter 400, 500 and 600 from
  `@expo-google-fonts/inter` as one font family, so the first frame already uses it.
- **Web:** `expo-font` loads the latin subset of the Inter variable font (48 KB for every weight,
  committed under `assets/fonts` with its license) with `font-display: fallback`: the system stack
  shows if it takes long, and the font never swaps in late. The full TTFs would be 1 MB, and a
  fontsource CSS import does not work with Metro (its `url()` files are not bundled).

### Icons: a registry of SF Symbols and Material Symbols paths

`src/core/adaptive/icons.ts` maps each name to an SF Symbol and the Material Symbols Outlined path.
`Icon` renders the SF Symbol through `expo-symbols` on iOS and an SVG path through
`react-native-svg` on Android and web.

- **Alternative: `expo-symbols` on Android and web too.** It loads the whole Material Symbols font
  (974 KB) at runtime and renders nothing until it arrives, so icons would pop in.
- The `md` names in `NativeTabs.Trigger.Icon` are drawn by the native tab bar itself.
- Custom activity glyphs (ski touring, climbing, …) join the registry with the tours port, as paths
  on every platform.

### Tests in three runtimes

Jest runs as iOS by default (`jest-expo`'s iOS preset). `*.test.android.tsx` runs the Material
components and the navigation flow with React Native Testing Library. `*.test.web.tsx` runs
web-only behavior with the DOM Testing Library, because react-native-web renders DOM elements that
React Native Testing Library cannot query. Both platforms' `Animated` finish at once under test, so
the menu test holds `Animated.timing` to check an interrupted fold. The navigation tests (iOS and
Android) replace `NativeTabs` with a `Slot`, because Jest's native tab bar keeps every tab mounted
and visible. Jest compiles with the React Compiler, as Metro does for the app, so memoization runs
under test (uncompiled, Jest passed the custom row whose tabs froze on the device). Jest renders
SwiftUI views as inert native views carrying their props, so the iOS navigation test presses the
menu's entries through `onButtonPress` and reads their groups and the circle's label; how the menu
looks and moves is only checked in the Simulator.

## Risks / Trade-offs

- [The system tab bar left ghost copies of the selected tab after Reduce Transparency was toggled
  (round 1)] → A system or Simulator fault that app code cannot reach; the owner rechecks it on the
  iPhone 15, and if it stays it goes to Apple through Feedback Assistant.
- [The menu circle sits above the tab bar, not level with it as the owner first wanted] → iOS gives
  a menu no place in the tab bar, and a row of our own (rounds 2 to 4) never moved like the system
  bar. The circle is FAB-sized and right above the bar's trailing end.
- [The iOS tab bar minimizes when a screen scrolls] → The tabs scroll nothing yet. When the calendar
  gets its list (Phase 3), the safe area below the circle shrinks with the bar; that port checks the
  circle follows smoothly, or sets the bar's `minimizeBehavior` to `never`.
- [The menu tests read `@expo/ui` props] → An `@expo/ui` update that renames `onButtonPress`, a
  modifier's fields or how a `Section` nests its buttons fails the tests loudly; the helpers at the
  top of the test file then change.
- [The JavaScript FAB menu misses Material 3 Expressive details on a device] → Android is not the
  focus; Phase 4 can swap in a Compose module behind the same props.
- [Web sheets close without exit animation on the browser's back button] → The route unmounts at
  once; acceptable, the in-app close paths animate.
- [The menu button covers content in the bottom-trailing corner] → Feature ports keep that corner
  free (map controls sit top-trailing, as in the spike).
- [The web tabs build on `expo-router/ui` headless tabs, marked experimental in SDK 58] → One
  layout file (`(tabs)/_layout.web.tsx`); if the API changes, the JavaScript `Tabs` navigator with a
  custom tab bar is the fallback.
- [The web dialog has no focus trap and no scroll container yet] → Fine for the placeholders; the
  first destination with real content adds scrolling, and keeping Tab inside the dialog (`inert`
  on the app beneath) comes with it.
- [Web first load grows] → About 404 KB gzipped JavaScript to a usable shell, under the 700 KB budget
  (#346 R3); the catalogs dominate and are unchanged. The export also holds the native tab layout as a
  chunk a browser never loads.

## Migration Plan

New dependencies and an Android font: run `npm install`, then `npx expo prebuild --clean` and
`npm run ios` for a new dev build. Rollback is reverting the merge.
