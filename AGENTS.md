# TourenBuddy Native Agent Guide

Canonical project context for all coding agents working in this repository.

## Project

TourenBuddy is a tour-planning app. Users pin tour objectives on a Swiss topo map (Swisstopo), link
contacts, and pick planned dates. This repository holds the iOS, Android and web clients, built with
React Native and Expo. They replace the Vue PWA in `sekael/tourenbuddy_frontend_vue`.

The plan lives in that repo's issues: epic sekael/tourenbuddy_frontend_vue#346 (decision IDs
D1–D18, risks, architecture) and one issue per phase, #367 (Phase 0, done) to #374 in the same repo.
Issue numbers in this file refer to that repo. Read the phase issue before proposing work in it.

## Stack

Decided or default in #346. Pin versions when a package is introduced.

- **Framework:** React Native + Expo (SDK 58, React Native 0.88), TypeScript, Hermes
- **Native projects:** Continuous Native Generation; `ios/` and `android/` are generated, never committed
- **Routing:** Expo Router (file-based), auth redirects in one place
- **State and local data:** Zustand; `expo-sqlite` (offline outbox), `expo-file-system`
- **Backend:** Supabase through `@supabase/supabase-js`, session in `expo-secure-store`. Schema,
  migrations and the Cloudflare Worker stay in the Vue repo (D3): no `supabase/` folder here
- **Map:** `@maplibre/maplibre-react-native` on iOS and Android, `maplibre-gl` on web (`.web.tsx`),
  Swisstopo tiles (free, no API key)
- **UI:** small in-house adaptive component layer (D5), one iOS and one Material implementation per
  component. iOS: system bars, tabs and sheets first, `expo-glass-effect` for floating controls,
  `@expo/ui` where needed. iOS 26 minimum, so no non-glass fallback
- **Fonts and icons:** iOS system font and SF Symbols; Android and web bundled Inter and Material
  Symbols. No runtime font downloads
- **Validation:** Zod. **i18n:** `i18next` on the `en` and `de-CH` JSON
- **Builds and releases:** EAS Build and EAS Submit, release-please

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
- User-facing text goes through `i18next` and every locale file.
- No `console.log()`; use the logging wrapper.
- Run lint, type-check and tests before declaring a task done.
- Agents cannot build or run the iOS and Android apps; the owner builds and measures on a Mac and
  devices. Give exact commands and what to look for.

## Commands

```bash
npx expo start                 # dev server
npx expo run:ios               # dev build on simulator or device (native modules need this)
npx expo run:android
npx expo install <package>     # add a dependency
npx expo lint                  # lint
npx tsc --noEmit               # type-check
npx expo-doctor                # dependency and config check
```

## Important Context

- Phase 0 findings (native map images, cluster properties on iOS, measured limits):
  https://github.com/sekael/tourenbuddy_frontend_vue/issues/367#issuecomment-6683373291
- Product specs come from the Vue repo's `openspec/specs`; Phase 1 copies them here (#368).
- Supabase free tier: expect higher auth latency.
- Backlog: https://github.com/users/sekael/projects/1
- Values: thoughtful development, understand before changing, small reviewable PRs.
