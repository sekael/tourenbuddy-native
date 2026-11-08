# Design

## Context

`checks.yml` runs lint, the type check, the tests and a web export on every pull request and push
to `main`. Nothing builds the native apps in CI, and no account is wired up yet: Apple is enrolled
(#367), Google Play, Firebase and the new Cloudflare Pages project are not. The repository is
public, so GitHub-hosted runners, macOS included, cost nothing. EAS's free plan has a small monthly
build quota with a queue. The Vue repo's `release.yml`, `deploy-preview.yml` and
`cleanup-preview.yml` are the model.

## Goals / Non-Goals

**Goals:**

- One merge of the release PR produces the web deploy and both store builds, with no manual version
  or build number edits.
- A pull request that would break a native build, or quietly add a permission, fails before merge.
- Mergeable now; each part starts working when its account and secrets exist.

**Non-Goals:**

- Store listings, screenshots, review notes (Phase 6), Firebase and push (B1), Universal Links (B4),
  the forced-update gate (D15).
- Over-the-air updates: D15 decided store updates only, so no `expo-updates`.

## Decisions

### Store builds on EAS, smoke builds on GitHub runners

- **EAS Build** for store builds: it manages signing (certificates, profiles, the Android upload
  key), builds with the image matching SDK 58 and submits with `--auto-submit`. Releases are rare,
  so the free quota suffices.
- **GitHub runners** for the pull request smoke: unlimited for a public repo, no EAS quota, no
  credentials. `npx expo prebuild` then a Release build: Android `assembleRelease` on Ubuntu (Java
  17, the image's Android SDK), iOS `xcodebuild` for the Simulator on `macos-26` (Xcode 26.6 by
  default) without code signing. Both build the `prod` variant, the identity that ships.
- **Only when native inputs change:** `package.json`, `package-lock.json`, `app.config.ts`,
  `eas.json`, `patches/**`, `assets/images/**`, `permissions.json`, the script and the workflow.
  Pure JavaScript changes cannot break the compile, and an iOS build takes about half an hour. Also
  on `workflow_dispatch` and weekly on `main`, to catch image updates. It is not a required check,
  since a path-filtered required check would block unrelated PRs.
- **Alternative: EAS builds on every PR.** Spends the quota on smoke builds and needs `EXPO_TOKEN` in
  PRs. Rejected.

### Build numbers from EAS

`cli.appVersionSource: remote` with `autoIncrement` on `production`: EAS stores the iOS build number
and the Android version code and raises them per build. The marketing version stays
`package.json`'s, which release-please bumps and `app.config.ts` already reads. No CI commit, no
number in git.

### Release flow

`release.yml` on push to `main`: release-please (`node`, the Vue repo's config). When a release is
created:

- **web:** `npx expo export --platform web` with `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` from the secrets, then `wrangler pages deploy dist` to the
  `tourenbuddy-native` project's production branch. A new project, because the PWA keeps
  `tourenbuddy` until the cutover (Phase 7).
- **native:** `eas build --platform all --profile production --non-interactive --no-wait
  --auto-submit`. The `production` profile reads the same two variables from EAS's `production`
  environment. Submission goes to TestFlight and the Play internal track as a draft release; a Play
  app that was never reviewed only accepts drafts, and the owner promotes it in the Console.

Each job checks for its secrets first and ends with a notice when they are missing.

### Previews

`preview.yml` and `preview-cleanup.yml` are the Vue workflows with the native export: same branch
slug rules (the head ref goes through `env`, never inline), same sticky comment, deletion through
the Pages API on close. Previews use the production backend, as Vue's do; the comment says so.

### Permission review

`scripts/check-permissions.js` (CommonJS, so Jest tests it without a transform) reads what the
release builds declare and compares it with `permissions.json`:

- **Android:** the `uses-permission` names in the built APK (`aapt2 dump permissions`): libraries
  add their own, so the app's manifest is not enough.
- **iOS:** the `NS…UsageDescription` keys and `UIBackgroundModes` in the built app's `Info.plist`
  (`plutil -convert json`), not the generated one: `expo-dev-client`'s plugin writes a local network
  usage description for the dev launcher, and a build phase strips it from Release builds.

Anything added or missing fails with the difference and what to do. The list is the record of what
the app asks for, which the privacy labels and the Data safety form are filled from (#346
section 9). The `expo-secure-store` plugin's default Face ID string is off (`add-auth-session`), so
the first list has no iOS entries. Android: `INTERNET`, `VIBRATE` (the template's) and AndroidX's
`DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. The template's `SYSTEM_ALERT_WINDOW` ("display over
other apps") serves React Native's dev overlays, so `prod` blocks it.

### 16 KB pages

Play requires native libraries aligned to 16 KB for updates from 2027-02-01 (#346 section 9). The
Android smoke checks both halves on the release APK: `zipalign -c -P 16 -v 4` for the zip entries,
and the NDK's `llvm-objdump` for every library's `LOAD` segments (`2**14` or more), as Google's
check script does. It builds the 64-bit ABIs only, which the rule concerns. A library that is not
aligned shows up long before the deadline.

## Risks / Trade-offs

- [The workflows cannot run here, and the first run happens on GitHub] → They follow the Vue repo's
  working workflows; the smoke and the permission list are checked by the first PR that touches
  native inputs, this one included. `permissions.json` starts from the generated manifest, the
  libraries' manifests and AndroidX's known entry; the first CI run may name an entry to add.
- [`macos-26` moves to a newer Xcode] → Weekly run on `main`; pin `xcode-select` if a release breaks
  the build.
- [A release-please PR opened by `GITHUB_TOKEN` triggers no checks] → Same as the Vue repo; its
  diff is the changelog and the version.
