# Tasks

## 1. Build and release config

- [x] 1.1 `eas.json`: remote app versions; `development` (dev client, internal, `dev`) and `production` (`prod`, `production` environment, auto-increment); submit to TestFlight and the Play internal track as a draft
- [x] 1.2 `release-please-config.json` and `.release-please-manifest.json` (`node`, version from `package.json`)

## 2. Workflows

- [x] 2.1 `release.yml`: release-please; on a release, `public/` deploy to Pages (no web app, 2026-11-22) and EAS build with auto-submit, each skipping with a notice without its secrets
- [x] 2.2 ~~`preview.yml` and `preview-cleanup.yml`~~ removed 2026-11-22: the web app stays the Vue PWA
- [x] 2.3 `native-build.yml`: iOS Simulator release build (`macos-26`) of `prod` on native inputs, weekly and on demand; permission review. The Android build (release APK, permission review, 16 KB alignment) is dropped while Android is not a priority (commit d066a19, this repository's PR #3)

## 3. Permission review

- [x] 3.1 `scripts/check-permissions.js` and `permissions.json`, the list generated from a local `npx expo prebuild` of `prod` and the manifests of the linked libraries, `SYSTEM_ALERT_WINDOW` blocked in `prod`; `test/scripts/check-permissions.test.ts` covers an added and a missing permission on each platform and a clean run

## 4. Docs and checks

- [x] 4.1 `docs/publishing.md`: one-time setup (including the GitHub default branch `main` and branch protection) and the release flow; README and `AGENTS.md` point to it
- [x] 4.2 `npm run check`, `openspec validate add-release-pipeline --strict`, `actionlint` on the workflows

## 5. Owner setup and checks

- [x] 5.1 After merge: the native build check ran green on this PR (or `permissions.json` updated from its output): green on #8 and #9 (2026-11-22)
- [x] 5.2 Setup per `docs/publishing.md` (EAS project id in `app.config.ts`, App Store Connect, Pages project, secrets); then the first release reaches TestFlight and the Pages production URL: 0.2.0 deployed `public/` to tourenbuddy.ch; its build was rejected for a missing usage string (ITMS-90683, fixed in #9), 0.2.1 (2) reached TestFlight 2026-11-23
- [x] 5.3 ~~Google Play (after the iOS release, `docs/publishing.md` "Android (later)"): first upload by hand, then `--platform all` and the internal track through the pipeline~~ moved to sekael/tourenbuddy_frontend_vue#373 (Android is not a priority)
