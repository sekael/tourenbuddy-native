# TourenBuddy Native Agent Guide

Canonical project context for all coding agents working in this repository.

## Project

TourenBuddy is a tour-planning app. Users pin tour objectives on a Swiss topo map (Swisstopo), link
contacts, and pick planned dates. This repository holds the iOS, Android and web clients, built with
React Native and Expo. They replace the Vue PWA in `sekael/tourenbuddy_frontend_vue`.

The plan lives in that repo's issues: epic sekael/tourenbuddy_frontend_vue#346 (decision IDs
D1–D19, risks, architecture) and one issue per phase, #367 (Phase 0, done) to #374 in the same repo.
Issue numbers in this file refer to that repo. Read the phase issue before proposing work in it.

## Stack

Decided or default in #346. Versions come from `npx expo install`; `package-lock.json` pins them.

- **Framework:** React Native + Expo (SDK 58, React Native 0.88), TypeScript, Hermes
- **Native projects:** Continuous Native Generation; `ios/` and `android/` are generated, never committed
- **Routing:** Expo Router (file-based), auth redirects in one place
- **State and local data:** Zustand; `expo-sqlite` (offline outbox), `expo-file-system`
- **Backend:** Supabase through `@supabase/supabase-js`, session in `expo-secure-store`. Schema,
  migrations and the Cloudflare Worker stay in the Vue repo (D3): no `supabase/` folder here
- **Map:** `@maplibre/maplibre-react-native` on iOS and Android, `maplibre-gl` on web (`.web.tsx`),
  Swisstopo tiles (free, no API key)
- **UI:** small in-house adaptive component layer (D5) in `src/core/adaptive/`: one iOS
  (`*.ios.tsx`) and one Material implementation per component, the Material one shared by Android
  and web, plus `*.web.tsx` where web differs. iOS: system tabs and sheets first, `@expo/ui`
  SwiftUI for glass controls and menus, `expo-glass-effect` for floating map controls. iOS 26
  minimum, so no non-glass fallback. Navigation: Map · Calendar tabs, the main menu in the thumb
  zone, destinations as sheet routes
- **Fonts and icons:** iOS system font and SF Symbols; Android embedded Inter, web a bundled Inter
  subset; Material Symbols drawn as SVG on Android and web. Icons come from the registry in
  `src/core/adaptive/icons.ts`. No runtime font downloads from third parties
- **Validation:** Zod. **i18n:** `i18next` + `react-i18next`, locale from `expo-localization`
- **Tooling:** ESLint (`eslint-config-expo`) with Prettier, Jest (`jest-expo`) with React Native
  Testing Library (DOM Testing Library for web-only tests)
- **Builds and releases:** EAS Build and EAS Submit, release-please

## Structure

```text
src/
  app/          Expo Router routes and layouts only; screens come from features/ and core/
  core/         shared infrastructure (adaptive/, i18n/, logging/, theme/, later offline/, realtime/)
  features/     <feature>/data, domain, presentation
  locales/      en.json, de-CH.json
test/           Jest tests, mirroring src/ (src/core/i18n/detect.ts → test/core/i18n/detect.test.ts)
assets/         images/ (app icon, launch image, favicon), fonts/ (web Inter subset)
openspec/       specs and changes
```

## Variants

`app.config.ts` builds the `dev` variant ("TourenBuddy Dev", `ch.tourenbuddy.app.dev`) unless
`APP_VARIANT=prod` selects the store identity (`ch.tourenbuddy.app`). Both install side by side.
Switching changes the bundle identifier: run `npx expo prebuild --clean` afterwards.

## Must Follow

- IMPORTANT: For any new feature or non-trivial change, use spec-driven development with OpenSpec:
  propose the change, wait for explicit owner approval before implementing, then prompt the owner
  to archive it. Each change reaches `main` through its own pull request.
- A simple task touching more than 3 files still gets a brief plan.
- Branch from latest `main` (`feat/<issue>-<description>` or `fix/<issue>-<description>`). Never
  commit to `main`.
- Never run `git commit`; give the owner a ready-to-copy conventional commit message
  (`type(scope): description`).
- Do not edit `CHANGELOG.md` or the package version manually (release-please).
- Expo changes every SDK release: do not trust training data. Read the `expo` major version in
  `package.json`, then use the matching docs (`https://docs.expo.dev/versions/v<major>.0.0/`) and
  `https://docs.expo.dev/llms.txt`.
- Add packages with `npx expo install <package>` (SDK-compatible versions). Prefer a platform
  feature, an Expo module or a few lines of code over a new dependency.
- Configure native behavior in the app config and config plugins, never by editing `ios/` or
  `android/`.
- Keep the layers: Presentation → Domain → Data → External. Domain has no React or React Native
  imports, features never import each other's internals, `core/` never depends on features.
  Web-only files use the `.web.tsx` suffix.
- Code ported from the Vue repo's `domain` and `data` layers stays plain TypeScript, so it and its
  tests move over nearly unchanged.
- User-facing text goes through `i18next` and every locale file. Catalogs use i18next syntax:
  `{{name}}` placeholders and plural keys `_one` / `_other` (plus `_zero` when 0 reads
  differently), called by the base key with `count`. Keys are typed against `en.json`.
- No `console` calls; use `createLogger('<tag>')` from `@/core/logging/logger` (lint enforces it).
- Tests cover edge cases and failures, not the happy path. Ported Vitest tests: `vi.` → `jest.`, drop
  the `vitest` import. React Native Testing Library v14 is async: `await render(...)`,
  `await fireEvent.press(...)`.
- Jest runs tests as iOS. `*.test.android.tsx` runs the Material components (`*.tsx`, shared with
  web) with React Native Testing Library; `*.test.web.tsx` runs web-only behavior (`*.web.tsx`)
  with the DOM Testing Library. `Animated` finishes at once under test: hold `Animated.timing` to
  test an interrupted animation.
- Colors, spacing, type and motion come from `@/core/theme/tokens` (semantic roles, never the
  palette or literals); text uses `Text` from `@/core/adaptive/text`. Honor Reduce Motion
  (`useReducedMotion`): no travel, overshoot or press scaling.
- Run `npm run check` (lint, type check, tests) before declaring a task done.
- Agents cannot build or run the iOS and Android apps; the owner builds and measures on a Mac and
  devices. Give exact commands and what to look for.

## Commands

```bash
npm start                      # dev server for an installed dev build
npm run ios                    # build and run the dev app on a simulator or device
npm run android
npm run web
npm run check                  # lint + type check + tests, as in CI
npm run lint                   # zero warnings; `npx expo lint --fix` formats
npm run typecheck              # generates route types first, then tsc
npm test                       # Jest
npx expo export --platform web # web build, as in CI
npx expo install <package>     # add a dependency
npx expo prebuild --clean      # regenerate ios/ and android/ after config or variant changes
npx expo-doctor                # dependency and config check
```

## Important Context

- Phase 0 findings (native map images, cluster properties on iOS, measured limits):
  https://github.com/sekael/tourenbuddy_frontend_vue/issues/367#issuecomment-6683373291
- `openspec/specs` was copied unchanged from the Vue repo at its parity baseline
  `tourenbuddy-frontend-v0.52.0`. Until the change that ports a capability rewrites its spec, the
  spec describes the Vue PWA: read it as the product behavior to match, not as implementation
  instructions.
- Focus is the iOS app. The owner tests mostly in iOS Simulators and checks on a real iPhone 15
  before releases. Android is not prioritized for now: keep it building and correct, but polish
  and device checks wait. Write device instructions for the Simulator first.
- Supabase free tier: expect higher auth latency.
- Backlog: https://github.com/users/sekael/projects/1
- Values: thoughtful development, understand before changing, small reviewable PRs.
