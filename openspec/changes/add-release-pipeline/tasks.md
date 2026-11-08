# Tasks

## 1. Build and release config

- [x] 1.1 `eas.json`: remote app versions; `development` (dev client, internal, `dev`) and `production` (`prod`, `production` environment, auto-increment); submit to TestFlight and the Play internal track as a draft
- [x] 1.2 `release-please-config.json` and `.release-please-manifest.json` (`node`, version from `package.json`)

## 2. Workflows

- [x] 2.1 `release.yml`: release-please; on a release, web deploy to Pages and EAS build with auto-submit, each skipping with a notice without its secrets
- [x] 2.2 `preview.yml` and `preview-cleanup.yml`: Pages preview per PR with a sticky comment, deleted on close
- [x] 2.3 `native-build.yml`: Android release build (Ubuntu) and iOS Simulator release build (`macos-26`) of `prod` on native inputs, weekly and on demand; permission review; 16 KB alignment (zip entries and ELF segments)

## 3. Permission review

- [x] 3.1 `scripts/check-permissions.js` and `permissions.json`, the list generated from a local `npx expo prebuild` of `prod` and the manifests of the linked libraries, `SYSTEM_ALERT_WINDOW` blocked in `prod`; `test/scripts/check-permissions.test.ts` covers an added and a missing permission on each platform and a clean run

## 4. Docs and checks

- [x] 4.1 `docs/publishing.md`: one-time setup (including the GitHub default branch `main` and branch protection) and the release flow; README and `AGENTS.md` point to it
- [x] 4.2 `npm run check`, `openspec validate add-release-pipeline --strict`, `actionlint` on the workflows

## 5. Owner setup and checks

- [ ] 5.1 After merge: the native build check ran green on this PR (or `permissions.json` updated from its output)
- [ ] 5.2 Setup per `docs/publishing.md` (EAS project id in `app.config.ts`, App Store Connect, Pages project, secrets); then the first release reaches TestFlight and the Pages production URL
- [ ] 5.3 Google Play: first upload by hand, then the internal track through the pipeline
