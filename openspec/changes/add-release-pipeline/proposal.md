# Proposal

## Why

The app so far builds only on the owner's Mac. Phase 1 ends with "CI is green and a build reaches
TestFlight and the Play internal track" (sekael/tourenbuddy_frontend_vue#368), and Phase 5's beta
needs builds testers can install. The Vue repo releases with release-please and deploys web
previews per pull request to Cloudflare Pages; the native app keeps both and adds store builds
through EAS (#346 section 4).

## What Changes

- **EAS Build and Submit (`eas.json`):** a `development` profile (dev client, `dev` variant,
  internal distribution) and a `production` profile (`prod` variant, store builds, submitted to
  TestFlight and the Play internal track). EAS keeps the build numbers and raises them on every
  production build, so CI never commits them.
- **Releases:** release-please (`node`) on `main` opens the release PR from conventional commits;
  merging it tags the version, deploys the web app to Cloudflare Pages and starts the store builds
  with automatic submission.
- **Web previews:** every pull request from this repository gets a Pages preview of the web app,
  linked in a PR comment and deleted when the PR closes, as in the Vue repo. Previews and store
  builds use the production backend, as Vue previews do.
- **Native build smoke:** pull requests that change native inputs (dependencies, app config, EAS
  config, patches, images) build a release app of the `prod` variant on a GitHub runner: iOS on
  macOS 26 for the Simulator, without signing.
- **Permission review:** the smoke compares the iOS usage descriptions and background modes in the
  release build with `permissions.json`, so a library that adds a permission fails the check until
  someone reviews and records it.
- **Setup without secrets is safe:** each job that needs an account skips with a notice until its
  secrets exist, so the pipeline can merge before the accounts are set up.
- **Runbook:** `docs/publishing.md` covers the one-time setup (EAS project, App Store Connect API
  key, Play service account and the first manual upload, Cloudflare Pages project, GitHub secrets,
  EAS environment variables) and what happens on each release. The store listing parts of the
  publishing runbook (#346 section 13) follow in Phase 6.

Not in this change: the forced-update gate (D15, with `app-update`), Firebase and push (B1),
Universal Links (B4), and the Android build smoke (release APK, permission review, 16 KB page
alignment): written, then dropped on 2026-11-08 while Android is not a priority (design, Risks).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-scaffolding`: pull request checks gain the native build smoke and the permission review;
  new requirements for releases and web previews.

## Impact

- Repository `sekael/tourenbuddy-native`, branch `feat/368-auth-realtime-release`. At the owner's
  request (2026-11-07) this change goes into one pull request with `add-auth-session` and the other
  Phase 1 change, approved by an independent reviewer before implementation and reviewed by the
  owner as a whole at the end: a recorded exception to one pull request per change.
- New files: `eas.json`, `release-please-config.json`, `.release-please-manifest.json`,
  `permissions.json`, `scripts/check-permissions.js`, `docs/publishing.md`, workflows `release.yml`,
  `preview.yml`, `preview-cleanup.yml`, `native-build.yml`.
- The owner sets up EAS, App Store Connect, Google Play and Cloudflare, and adds the GitHub secrets
  (`EXPO_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`,
  `SUPABASE_ANON_KEY`); `docs/publishing.md` lists the steps. No app code change; `app.config.ts`
  blocks `SYSTEM_ALERT_WINDOW` in `prod`, and ESLint allows `console` in `scripts/`.
