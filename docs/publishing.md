# Publishing

How a change reaches the App Store and the public pages on tourenbuddy.ch, and the one-time setup
behind it. Android ships later: what it still needs is under "Android (later)". The web app is the
Vue PWA, released from its own repository: this one releases no web app, and its web build runs
locally only (development and reviews).
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
   - **site:** `public/` as it is (the legal pages, the association file and `app-config.json`),
     deployed to the Cloudflare Pages project `tourenbuddy-native` (production branch `main`,
     served on `tourenbuddy.ch`).
   - **native:** `eas build --platform ios --profile production --auto-submit`. EAS raises the
     build number (`appVersionSource: remote`), signs the app and submits it to TestFlight once
     built.
4. In App Store Connect, the build reaches TestFlight after Apple's processing; submit it for review
   from there.

The marketing version comes from `package.json`, which only release-please changes.

## Device checks before review

On the iPhone 15, with the TestFlight build (the store identity: the association file comes through
Apple's CDN, as for users), before submitting it for review. These need a real device:

- Sign-in code: the code from Mail is offered above the keyboard and signs in on its own.
- Restart the phone, wait a minute without unlocking, unlock and open the app: still signed in.
- Create account with **Use Strong Password**: Passwords holds it for `tourenbuddy.ch`; after
  signing out, the account is offered above the keyboard and Face ID fills both fields.

## Checks on pull requests

- `checks.yml`: lint, type check, tests and a web export, on every pull request.
- `native-build.yml`: a release build of the store identity (`APP_VARIANT=prod`) without signing,
  iOS for the Simulator on `macos-26`, when a pull request changes native inputs (dependencies,
  `app.config.ts`, `eas.json`, images, `permissions.json`), weekly on `main` and on demand
  (Actions → Native build → Run workflow). It also runs the **permission review:** the usage
  descriptions and background modes in the built `Info.plist` must match `permissions.json`. A new
  entry is a decision: block it in `app.config.ts`, or add it to `permissions.json` and update the
  App Store privacy labels in the same pull request.

## One-time setup

### GitHub

- Settings → General: default branch `main`, squash merging only, the pull request title as the
  default squash message.
- Settings → Actions → General → Workflow permissions: allow GitHub Actions to create pull
  requests (release-please opens the release pull request).
- Settings → Rules: protect `main` with required pull requests, signed commits and squash merges.
  Do not require status checks: the release pull request never gets any (see the release flow), so
  it could not be merged.
- Settings → Secrets and variables → Actions, repository secrets for the public pages:

  | Secret                  | Value                                                       |
  | ----------------------- | ----------------------------------------------------------- |
  | `CLOUDFLARE_API_TOKEN`  | Cloudflare API token with Account → Cloudflare Pages → Edit |
  | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id                                       |

### Cloudflare Pages

```sh
npx wrangler pages project create tourenbuddy-native --production-branch main
```

A project of its own: the PWA keeps `tourenbuddy` (test.tourenbuddy.ch).

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
npx eas-cli env:create --environment production --name EXPO_PUBLIC_NOTIFY_HOOK_URL --value <worker url> --visibility plaintext
```

Repeat with `--environment development` for development builds. The anon key ships inside every
app, so it is not a secret.

### App Store Connect

1. Users and Access → Integrations → App Store Connect API: create a key with the App Manager role.
2. `npx eas-cli credentials --platform ios`, profile `production`: let EAS register the bundle id
   `ch.tourenbuddy.app`, create the distribution certificate and provisioning profile, and add the
   API key for submissions. App Store Connect offers only registered bundle ids, so this comes
   before the app.
3. Create the app: bundle id `ch.tourenbuddy.app`, name TourenBuddy, primary language German.
   Pricing and Availability: free, **Switzerland only**. The legal pages follow the Swiss FADP
   alone; any EU or EEA country (Liechtenstein too) brings in the GDPR and an EEA representative.
4. Add the app's Apple ID (App Information → Apple ID) to `eas.json`:
   `"submit": { "production": { "ios": { "ascAppId": "<Apple ID>" } } }`.

### Public pages on tourenbuddy.ch

Each release deploys `public/`: the privacy policy, terms of use,
imprint and account deletion, in English at the root and in German under `/de/`
(`/privacy`, `/de/privacy`, …), one stylesheet (`/legal.css`), and `/app-config.json`.

Before the first store submission:

1. **Legal review.** Have the privacy policy, terms and deletion page reviewed (Swiss FADP)
   and update `Last updated` / `Stand` on every page changed. The texts follow #346 section 9.
   The app shows the privacy policy, terms and imprint itself (Profile → About), word for word
   from the locales' `about.*`: change a sentence in both places; `about-content.test.ts` fails
   until they match.
2. **Imprint.** Replace the bracketed name and address in `public/imprint/index.html` and
   `public/de/imprint/index.html`, and put the same lines (name, street and number, postcode and
   place) into `OPERATOR` in `src/features/user/presentation/about-pages.tsx`; until then the app's
   imprint leaves its "operated by" lines out.
3. **Store listings.** Use these URLs:

   | Field                    | URL                              |
   | ------------------------ | -------------------------------- |
   | App Store privacy policy | `https://tourenbuddy.ch/privacy` |
   | Support / contact        | `mailto:feedback@tourenbuddy.ch` |

**Universal Links.** `/.well-known/apple-app-site-association` lists both iOS apps for every path
except the public pages, so a notification link (`https://tourenbuddy.ch/?notification=…`) opens
the app and the legal pages open in Safari. Development builds read the file from the domain
(`?mode=developer`); store builds read it through Apple's CDN, which can take a day after a change.

**Update gate.** `app-config.json` holds the oldest app version each platform still supports.
Raise `min_supported_ios` (and set `ios_store_url` once the listing exists) to send older apps to
the store; Pages caches it for five minutes. Backend changes stay
expand-then-contract until the minimum passes every app that uses the old shape. Until the apex
serves `/app-config.json`, the request fails and the gate stays open: deploy `public/` before the
first store build, or no app can be held back. The
gate blocks only while the device is online (app-update: being offline never blocks): an app below
the minimum keeps working offline and may queue writes in the old shape, which replay once it is
updated. So a minimum raised for a breaking backend change still needs the old shape accepted until
those queues drain, or the replays dead-letter.

### Supabase auth: passwords and passkeys

The auth settings live in the Vue repository: `supabase/config.toml` for the local stack, the
dashboard for the hosted project. Its change `unconfirmed-accounts-hold-no-password` brings them
with a migration.

1. **The migration first, as soon as it is merged there** (it fixes the live backend, whatever this
   app does): run the audit query from that change's design in the dashboard's SQL editor and look
   at the list, then `supabase db push`, and right after it, in Authentication → Sign In /
   Providers → Email, turn on **Confirm email**. The migration keeps every unconfirmed account
   without a password and drops the passwords that exist (no client ever set one; every account
   keeps signing in with a code).
2. Same page: **Minimum password length** 8, and **Secure password change** on (the Vue change
   `add-native-backend`): a password set on a session older than a day then needs a code.
3. Authentication → Passkeys: on, display name `TourenBuddy`, relying party ID `tourenbuddy.ch`,
   origins `https://tourenbuddy.ch, https://test.tourenbuddy.ch`. Never change the relying party
   ID once someone has a passkey: every passkey would stop working.
4. **Association file:** put the Apple Team ID (developer.apple.com → Membership) in place of
   `TEAMID` in `public/.well-known/apple-app-site-association`, and as `ios.appleTeamId` in
   `app.config.ts`: without it a Simulator build carries no team and never matches the file. The
   apex `tourenbuddy.ch` serves it from `public/`: add the apex as a custom domain of the
   `tourenbuddy-native` Pages project. Until the first release deploys `public/`, deploy it by hand:
   `npx wrangler pages deploy public --project-name tourenbuddy-native --branch main`. Check:
   `curl -i https://tourenbuddy.ch/.well-known/apple-app-site-association` answers 200 with
   `content-type: application/json`, without a redirect. The app ids need the Associated Domains
   capability: EAS turns it on for store builds, Xcode's automatic signing for development builds
   on a device.

Builds with the password screens reach testers only after step 1.

### Turn on store builds

Only once App Store Connect is set up: before that, a release would build and then fail to submit.
Create a robot token on expo.dev (Account settings → Access tokens) and add it as the repository
secret `EXPO_TOKEN`. The next release builds and submits the iOS app.

## Version and build numbers

- Version: `package.json` → `app.config.ts`, bumped by release-please.
- Build numbers: stored on EAS and raised per build. `npx eas-cli build:version:get` shows them,
  `build:version:set` corrects them (for example after a manual upload).

## Android (later)

Not released yet. Before the first Android release:

1. **Push:** a Firebase project; its `google-services.json` as `android.googleServicesFile` in
   `app.config.ts` (without it Android gets no push token), and the Worker secret
   `FCM_SERVICE_ACCOUNT` in the Vue repository's `services/email-hook`.
2. **Google Play:**
   1. Create the app in the Play Console (package `ch.tourenbuddy.app`), free, available in
      Switzerland only (as on the App Store).
   2. Google Cloud: a service account with a JSON key; in the Play Console (Users and permissions)
      invite it with release rights for the app.
   3. `npx eas-cli credentials --platform android`, profile `production`: let EAS generate the
      upload keystore, and upload the service account key for submissions.
   4. Google Play accepts API uploads only after a first manual one:
      `npx eas-cli build --platform android --profile production`, download the `.aab` and upload
      it to Internal testing in the Play Console.
3. **App Links:** copy the app signing key's SHA-256 from Play Console → Test and release → App
   integrity → App signing (not the upload key) into `public/.well-known/assetlinks.json`:

   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "ch.tourenbuddy.app",
         "sha256_cert_fingerprints": ["<SHA-256>"]
       }
     }
   ]
   ```

   and give it `Content-Type: application/json` in `public/_headers`.

4. **Store listing:** Play privacy policy `https://tourenbuddy.ch/privacy`, Data safety account
   deletion URL `https://tourenbuddy.ch/account-deletion`, support as for iOS. Once it exists, set
   `android_store_url` (and `min_supported_android` when needed) in `public/app-config.json`.
5. **Build check:** restore the Android job of `native-build.yml` (release APK, the permission
   review, and the 16 KB page alignment Google Play requires for updates from 2027-02-01) from
   commit d066a19 (this repository's PR #3).
6. **Releases:** `--platform all` in `release.yml`, `ios` and `android` in its comment. Each
   release then also submits to the Play internal track as a draft: roll it out in the Play
   Console (internal testing), then promote it.
