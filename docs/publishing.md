# Publishing

How a change reaches the App Store, Google Play and the web, and the one-time setup behind it.
Every part skips with a notice until its secrets exist, so the workflows stay green before setup.
Follow the setup in order: `EXPO_TOKEN` comes last, because it turns the store builds on.

## Release flow

1. Pull requests are squash-merged into `main`. The squash title is a conventional commit
   (`feat(auth): …`, `fix: …`); release-please reads only that title.
2. `release.yml` keeps a release pull request open with the next version and the changelog. It is
   opened with the workflow's `GITHUB_TOKEN`, and GitHub starts no workflows for that token's pull
   requests, so it shows no checks. It only changes `package.json`, `package-lock.json`,
   `.release-please-manifest.json` and `CHANGELOG.md`; to run the checks anyway, close and reopen
   it.
3. Merging it tags the release and starts two jobs:
   - **web:** `npx expo export --platform web`, deployed to the Cloudflare Pages project
     `tourenbuddy-native` (production branch `main`).
   - **native:** `eas build --platform all --profile production --auto-submit`. EAS raises the
     build numbers (`appVersionSource: remote`), signs both apps and submits them once built:
     iOS to TestFlight, Android to the Play internal track as a draft.
4. In App Store Connect, the build reaches TestFlight after Apple's processing; submit it for review
   from there. In the Play Console, roll out the draft (internal testing), then promote it.

The marketing version comes from `package.json`, which only release-please changes.

## Checks on pull requests

- `checks.yml`: lint, type check, tests and a web export, on every pull request.
- `native-build.yml`: release builds of the store identity (`APP_VARIANT=prod`) without signing,
  Android on Ubuntu and iOS for the Simulator on `macos-26`, when a pull request changes native
  inputs (dependencies, `app.config.ts`, `eas.json`, images, `permissions.json`), weekly on `main`
  and on demand (Actions → Native build → Run workflow). It also runs:
  - **Permission review:** the permissions in the built APK and the usage descriptions and
    background modes in the built `Info.plist` must match `permissions.json`. A new entry is a
    decision: block it in `app.config.ts`, or add it to `permissions.json` and update the App Store
    privacy labels and the Play Data safety form in the same pull request.
  - **16 KB pages:** every native library in the APK has 16 KB aligned ELF segments and zip
    entries, as Google Play requires for updates from 2027-02-01.
- `preview.yml`: each pull request from this repository gets a web preview on Pages, linked in a
  sticky comment; `preview-cleanup.yml` deletes it when the pull request closes. Previews use the
  production Supabase project.

## One-time setup

### GitHub

- Settings → General: default branch `main`, squash merging only, the pull request title as the
  default squash message.
- Settings → Actions → General → Workflow permissions: allow GitHub Actions to create pull
  requests (release-please opens the release pull request).
- Settings → Rules: protect `main` with required pull requests, signed commits and squash merges.
  Do not require status checks: the release pull request never gets any (see the release flow), so
  it could not be merged.
- Settings → Secrets and variables → Actions, repository secrets for the web:

  | Secret                  | Value                                                         |
  | ----------------------- | ------------------------------------------------------------- |
  | `SUPABASE_URL`          | hosted project URL (as in the Vue repository)                  |
  | `SUPABASE_ANON_KEY`     | hosted project anon key                                       |
  | `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with Account → Cloudflare Pages → Edit   |
  | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id                                         |

### Cloudflare Pages

```sh
npx wrangler pages project create tourenbuddy-native --production-branch main
```

A new project: the PWA keeps `tourenbuddy` until the cutover.

### Expo (EAS)

```sh
npx eas-cli@latest login
npx eas-cli@latest init
```

`init` creates the project on expo.dev. The config is dynamic (`app.config.ts`), so add what it
prints yourself, then commit:

```ts
owner: '<expo account>',
extra: { eas: { projectId: '<project id>' } },
```

Store the backend for builds made on EAS (the `production` and `development` environments):

```sh
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value <url> --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon key> --visibility plaintext
```

Repeat with `--environment development` for development builds. The anon key ships inside every
app, so it is not a secret.

### App Store Connect

1. Create the app: bundle id `ch.tourenbuddy.app`, name TourenBuddy, primary language German.
2. Users and Access → Integrations → App Store Connect API: create a key with the App Manager role.
3. `npx eas-cli credentials --platform ios`, profile `production`: let EAS create the distribution
   certificate and provisioning profile, and add the API key for submissions.
4. Add the app's Apple ID (App Information → Apple ID) to `eas.json`:
   `"submit": { "production": { "ios": { "ascAppId": "<Apple ID>" } } }`.

### Google Play

1. Create the app in the Play Console (package `ch.tourenbuddy.app`).
2. Google Cloud: a service account with a JSON key; in the Play Console (Users and permissions)
   invite it with release rights for the app.
3. `npx eas-cli credentials --platform android`, profile `production`: let EAS generate the upload
   keystore, and upload the service account key for submissions.
4. Google Play accepts API uploads only after a first manual one:
   `npx eas-cli build --platform android --profile production`, download the `.aab` and upload it
   to Internal testing in the Play Console. From then on, releases submit on their own.

### Turn on store builds

Only once App Store Connect and Google Play are set up, with the first Play upload done: before
that, a release would build and then fail to submit. Create a robot token on expo.dev (Account
settings → Access tokens) and add it as the repository secret `EXPO_TOKEN`. The next release
builds and submits both apps.

## Version and build numbers

- Version: `package.json` → `app.config.ts`, bumped by release-please.
- Build numbers: stored on EAS and raised per build. `npx eas-cli build:version:get` shows them,
  `build:version:set` corrects them (for example after a manual upload).
