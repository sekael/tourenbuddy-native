# Tasks

## 1. Theme

- [x] 1.1 Tokens in `src/core/theme/tokens.ts` (palette, color roles, spacing, radius, type, sizes, motion, shadow, breakpoints); `test/core/theme/tokens.test.ts` checks every text role for WCAG AA
- [x] 1.2 `useBreakpoint` (600 / 1024 px) and `useReducedMotion`; `test/core/theme/use-breakpoint.test.ts` covers both edges
- [x] 1.3 Inter: `expo-font` plugin embeds 400, 500 and 600 on Android (`npx expo prebuild` shows `res/font/xml_inter.xml` and the `ReactFontManager` registration); web loads `assets/fonts/inter-latin-variable.woff2` (48 KB, OFL) with `font-display: fallback`, bundled by `npx expo export --platform web`

## 2. Adaptive components

- [x] 2.1 Icon registry (SF Symbol + Material Symbols path) and `Icon` (`expo-symbols` on iOS, SVG on Android and web); `test/core/adaptive/icons.test.ts` rejects malformed entries
- [x] 2.2 `Text` with the type scale and platform font
- [x] 2.3 `FloatingMenu`: Material FAB menu on Android and web with staggered unfold, outside tap, Back and Escape; `floating-menu.test.android.tsx` and `.test.web.tsx` cover open, choose, dismiss, an interrupted fold and focus order; items are a labelled group of buttons, and the menu folds away when its screen loses focus
- [x] 2.4 `CloseButton`: SwiftUI `role="close"` in glass on iOS, tonal round button on Android and web
- [x] 2.5 `Sheet` and `sheetOptions`: `formSheet` fitted to content on iOS and Android; web bottom sheet below 600 px and top-hanging dialog from 600 px, Escape, backdrop, glide-out and a single `back()`; `sheet.test.web.tsx` covers semantics, the close race, the link fallback and listener cleanup

## 3. Navigation

- [x] 3.1 Root `Stack` with `(tabs)` and the sheet routes `inbox`, `contacts`, `profile`, `feedback`, anchored on `(tabs)`
- [x] 3.2 `NativeTabs` with Map and Calendar on iOS and Android (iOS since round 4, see 6.4); web navigation bar below 600 px and rail from 600 px
- [x] 3.3 Main menu on both tabs, placeholders for both tabs and the destinations, new keys in `en` and `de-CH`; `test/app/navigation.test.android.tsx` covers every menu route, returning to the tab, the menu folding away under a sheet and a link straight to a destination; `test/app/shell.test.tsx` switches language with the real tabs

## 4. Tooling and docs

- [x] 4.1 Jest projects: iOS by default, `*.test.android.tsx`, `*.test.web.tsx` (jsdom, DOM Testing Library), all compiled with the React Compiler as Metro does; `npm run check` passes
- [x] 4.2 `AGENTS.md`: adaptive layer, theme, icons, test runtimes, Reduce Motion
- [x] 4.3 `openspec validate add-adaptive-ui --strict` passes; `npx expo-doctor` passes; web export under the 700 KB budget

## 5. Owner checks

- [ ] 5.1 iOS Simulator (`npm install`, `npx expo prebuild --clean`, `npm run ios`): see 6.6 for the tab bar and the menu; each menu item opens a glass sheet sized to its content with the system close button, covering the tab bar; closing returns to the same tab; German labels after switching the app language
- [ ] 5.2 Web (`npm run web`): narrow window shows the bottom bar and a bottom sheet; a window 600 px or wider shows the rail and a top-hanging dialog; Escape and the backdrop close it; the FAB menu unfolds smoothly and Tab moves from the button into the items
- [ ] 5.3 Android (optional while iOS is the focus): Material navigation bar, FAB menu, Back closes the menu, Inter in the first frame

## 6. Owner feedback from the Simulator (2026-11-07)

- [x] 6.1 Round 1: iOS `GlassDock` under headless tabs in `(tabs)/_layout.ios.tsx` replaces the system tab bar (ghosting after Reduce Transparency, menu detached and small); menu entries as in the Vue app (Inbox, Contacts, Profile, Offline maps, Map layers, Feedback), the map's own on the Map tab only, from `useMainMenuItems(tab)`; `offline-maps` and `map-layers` placeholder sheets; `layers` and `offline` icons; `floating-menu.ios.tsx` removed
- [x] 6.2 Round 2: the SwiftUI row's place buttons did not respond on the device, the toggle was left-aligned and the system menu opened over it. The dock is now React Native `Pressable`s over `expo-glass-effect` glass: the places centred, the menu circle at the trailing edge, the menu a glass panel above the circle that materializes natively; `useFloatingMenu` shared with the FAB menu; `expo-glass-effect` a direct dependency
- [x] 6.3 Round 3: the places still did not switch on the device, as in round 2. The cause of both: the React Compiler (on in the app, off in Jest) reused the tabs layout's `NavigationContent` element, so the tabs never saw a new state. `(tabs)/_layout.ios.tsx` opts out with `'use no memo'`, and Jest now compiles like Metro. The dock is SwiftUI again (interactive glass capsule, the places centred, a glass button circle), and the menu entries are separate SwiftUI glass pills rising from the circle one after another; `expo-glass-effect` is no longer a direct dependency
- [x] 6.4 Round 4: the places switched, but without a glide, and fewer pills showed with each opening. The owner asked to start over with real iOS components and chose the system tab bar with the menu circle above it. iOS uses the `NativeTabs` layout with Android (`(tabs)/_layout.ios.tsx`, `GlassDock`, `useFloatingMenu` and `main-menu.ios.tsx` removed); `floating-menu.ios.tsx` is a SwiftUI `Menu` in a 60 pt glass circle right above the bar, monochrome, the map's entries in a `Section` of their own; `size.dock` is now `size.menu`. Jest keeps compiling with the React Compiler
- [x] 6.5 `test/app/navigation.test.tsx` (iOS) checks the menu's groups on both tabs, the circle's label and an entry's sheet closing back to its tab; `test/app/shell.test.tsx` reads the tab bar's labels in German; mutation-checked (one group for all, no label, map entries on both tabs, no map section, an untranslated tab)
- [ ] 6.6 Simulator: tapping Map and Calendar switches the place with the system's glass selection; the glass circle is 60 pt, right above the bar's trailing end, its edge in line with the bar's, never over it; it opens the system menu out of its glass with Inbox nearest the circle, Offline maps and Map layers between separators on Map, four entries without separators on Calendar, icons in the text color; a tap outside and the VoiceOver escape gesture (two-finger Z) close it; each entry opens its sheet over the bar and closing returns to the same tab; VoiceOver reads the circle as "Menu"; toggling Reduce Transparency on and off leaves no ghost images in the bar (if it does, note it for Feedback Assistant); with Reduce Motion the menu and the selection still behave like system controls

## Workflow follow-up

- Owner commits, opens the PR and merges after review; then archive the change.
