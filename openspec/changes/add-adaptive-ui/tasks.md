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
- [x] 3.2 `NativeTabs` with Map and Calendar on Android; web navigation bar below 600 px and rail from 600 px
- [x] 3.3 Main menu on both tabs, placeholders for both tabs and the destinations, new keys in `en` and `de-CH`; `test/app/navigation.test.android.tsx` covers every menu route, returning to the tab, the menu folding away under a sheet and a link straight to a destination; `test/app/shell.test.tsx` switches language with the real tabs

## 4. Tooling and docs

- [x] 4.1 Jest projects: iOS by default, `*.test.android.tsx`, `*.test.web.tsx` (jsdom, DOM Testing Library); `npm run check` passes
- [x] 4.2 `AGENTS.md`: adaptive layer, theme, icons, test runtimes, Reduce Motion
- [x] 4.3 `openspec validate add-adaptive-ui --strict` passes; `npx expo-doctor` passes; web export under the 700 KB budget

## 5. Owner checks

- [ ] 5.1 iOS Simulator (`npm install`, `npx expo prebuild --clean`, `npm run ios`): see 6.4 for the dock; each menu item opens a glass sheet sized to its content with the system close button, covering the dock; closing returns to the same tab; German labels after switching the app language
- [ ] 5.2 Web (`npm run web`): narrow window shows the bottom bar and a bottom sheet; a window 600 px or wider shows the rail and a top-hanging dialog; Escape and the backdrop close it; the FAB menu unfolds smoothly and Tab moves from the button into the items
- [ ] 5.3 Android (optional while iOS is the focus): Material navigation bar, FAB menu, Back closes the menu, Inter in the first frame

## 6. Owner feedback, first Simulator round (2026-11-07)

- [x] 6.1 iOS: `GlassDock` (`src/core/adaptive/glass-dock.tsx`) under headless tabs in `(tabs)/_layout.ios.tsx` replaces the system tab bar: Map and Calendar in a glass capsule at the leading edge, the menu as a 60 pt glass circle level with it at the trailing edge; selection pill glides (not with Reduce Motion); VoiceOver tab bar with a selected trait; menu icons in the label color; `floating-menu.ios.tsx` removed
- [x] 6.2 Menu entries as in the Vue app (Inbox, Contacts, Profile, Offline maps, Map layers, Feedback), the map's own on the Map tab only, from `useMainMenuItems(tab)`; `offline-maps` and `map-layers` placeholder sheets; `layers` and `offline` icons
- [x] 6.3 `test/app/tabs.test.tsx` (iOS dock: selection from a link, switching, re-selecting, menu order per tab, sheet and back), Android navigation test covers the new entries and the calendar's shorter menu, the language test checks the dock labels; mutation-checked
- [ ] 6.4 Simulator: the capsule and the circle are the same height and level, near the bottom like the system tab bar; tapping anywhere on a place switches it and the pill glides; the menu opens out of the circle with Inbox nearest, plain dark icons, six entries on Map and four on Calendar; toggling Reduce Transparency on and off leaves no ghost images; Reduce Motion stops the pill gliding; VoiceOver reads "Map, selected" in a tab bar and "Menu, button"; with larger text the labels grow up to the largest standard size (the accessibility sizes stay capped there) and still fit their pill; taps between the capsule and the circle reach the screen beneath

## Workflow follow-up

- Owner commits, opens the PR and merges after review; then archive the change.
