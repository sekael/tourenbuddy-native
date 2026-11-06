# Tasks

## 1. Project and tooling

- [x] 1.1 Add dependencies with `npx expo install` and the scripts `start`, `ios`, `android`, `web`, `lint`, `typecheck`, `test`, `check`; verify `npm ci` installs from the lockfile
- [x] 1.2 Add `app.config.ts` with the `dev` / `prod` variants, iOS 26 target, light appearance, predictive back, encryption declaration, per-app languages and splash; verify `npx expo config` prints `ch.tourenbuddy.app.dev` by default and `ch.tourenbuddy.app` with `APP_VARIANT=prod`
- [x] 1.3 Add `tsconfig.json`, `.gitignore` (native folders, `.expo`, local env files), `.nvmrc` and the VS Code recommendations; verify `git status` stays clean after `npx expo prebuild`
- [x] 1.4 Configure ESLint with Prettier and `no-console`; verify `npm run lint` passes at zero warnings
- [x] 1.5 Configure Jest (`jest-expo` preset, `@/` alias, `test/` root); verify `npm test` runs

## 2. Logging

- [x] 2.1 Add `src/core/logging/logger.ts` with tagged `debug` / `info` / `warn` / `error` that drops `debug` and `info` in release builds; verify `test/core/logging/logger.test.ts` covers both build modes

## 3. i18n

- [x] 3.1 Convert the Vue `en` and `de-CH` catalogs from the baseline tag to i18next format into `src/locales/`; verify the 1,061 Vue keys per locale become 1,079 (the 12 pipe plurals split into `_zero` / `_one` / `_other` keys) and no vue-i18n syntax remains
- [x] 3.2 Port the supported-locales registry and `detectLocale` as pure functions; verify `test/core/i18n/detect.test.ts` (ported Vue cases plus region and empty-list edges)
- [x] 3.3 Initialise i18next synchronously with typed keys, and follow device language changes from the root layout; verify a plural test for zero / one / other and that `t('does.not.exist')` fails `tsc`
- [x] 3.4 Add the locale checks as a Jest test (key parity both ways, placeholder parity, leftover pipes, single braces and `{'…'}` escapes); verify it fails on a deliberately broken catalog and passes on the real ones

## 4. Shell and launch

- [x] 4.1 Add the root layout and the empty shell screen (app name, localized tagline); verify a component test renders the tagline in `en` and `de-CH`
- [x] 4.2 Generate the icon, adaptive icon, launch image and favicon from the 2048 px winter master `assets/images/winter-original.png`; verify sizes and that `icon.png` has no alpha channel

## 5. CI

- [x] 5.1 Add the PR check workflow (lint, type check, tests, web export) for pull requests and pushes to `main`; verify every step passes locally with the same commands

## 6. Docs and agent setup

- [x] 6.1 Update `AGENTS.md` (structure, testing, variants, checks), the README (setup and first run) and `openspec/config.yaml` (copied-specs context); port `.claude/settings.json`; verify the README commands match `package.json`

## 7. Verification

- [x] 7.1 Run `npm run check` and `npx expo export --platform web`; verify both pass
- [ ] 7.2 Owner: dev build in the iOS Simulator plus web (Android optional while iOS is the focus); verify launch on white without a flash, app name "TourenBuddy Dev", German tagline after switching the app language in system settings, dark status bar icons on white also when the device is in dark mode

## Workflow follow-up

- Owner commits, opens the PR and merges after review.
- Archive the change after merge (`openspec archive add-app-foundation`), which applies the
  `project-scaffolding` and `i18n` deltas to `openspec/specs`.
