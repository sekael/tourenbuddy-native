# Design

## Context

`main` runs the shell: `NativeTabs` with four placeholder tabs, sheet routes, tokens, icons and
the adaptive layer (`src/core/adaptive`). There is no backend access yet. The Vue app's auth lives
in `features/auth` (store, two pages, hero layout), `core/auth/session-trust.ts` and the router
(`setupRouterGuards`, `setupAuthRedirect`); its spec is `openspec/specs/auth`. Supabase is shared
with the live PWA (D3, M4): no backend change. Supabase's free tier makes auth calls slow.

## Goals / Non-Goals

**Goals:**

- The PWA's sign-in and session behavior, scenario by scenario, on iOS, Android and web.
- iOS: system controls (text fields with content types, system buttons, navigation bar back
  button) and the keyboard handled the way iOS apps handle it.
- A session that survives offline launches, iOS prewarming and app updates, and does not survive a
  reinstall or move to another device.
- Beyond the PWA (owner, 2026-11-08): account creation with a password, sign-in with the password
  or a passkey (Face ID on iOS), and setting the password and managing passkeys in Profile.

**Non-Goals:**

- Profile, onboarding, push, offline caches, the outbox, account deletion (see the proposal).
- Sign in with Apple: no third-party login exists (passwords and passkeys are the app's own), so
  Apple 4.8 does not apply (#346 section 9).
- A password reset email: a code sign-in followed by the Password sheet gets there with the flow
  that exists.
- The same methods in the PWA, and passkeys on web before Phase 7 (see below).
- Keeping a deep link across sign-in: the PWA sends a signed-out user to sign-in and then to the
  map, and so does the app. Universal Links (B4) and notification taps can revisit this.

## Decisions

### Session storage: `expo-secure-store` on iOS and Android, browser storage on web

- The client gets a storage adapter over `expo-secure-store` (Keychain on iOS, Keystore-encrypted
  preferences on Android), as #346 section 7 decided.
- **`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`**, passed on every call. Readable whenever the phone has
  been unlocked once since a restart, so a token refresh that lands while the phone is locked can
  still be saved; never restored to another device from a backup. The default, `WHEN_UNLOCKED`,
  fails whenever the phone is locked.
- **Prewarming:** iOS may launch the app in the background after a restart, before the first
  unlock, when the Keychain and the app's files are still locked. Reading then would look like "no
  session" (and the reinstall marker below like "missing"). So the adapter does nothing until the
  app has been in the foreground once (`AppState` `active`), which means the phone is unlocked. A
  normal cold start is not in the background (`AppState.currentState`), so the gate opens at once.
  Session restore waits for the same moment before its 4 s bound starts, and the launch screen stays
  until then; the user never sees it, since a prewarmed app is not on screen.
- **Size:** Expo enforces no limit. Some older iOS releases refused values over about 2 KB; iOS 26
  (D7) does not, and the session (JWT, refresh token, user) is about 3 KB. A failing write fails
  the verification that saves it, so the user sees the code screen's error instead of a session
  that is gone on the next launch. Task 5.1 has the owner confirm the size on the Simulator.
- **Reinstall:** the iOS Keychain keeps items after the app is deleted. The adapter keeps a marker
  file in the app's document directory (`expo-file-system`), which is deleted with the app. When the
  marker is missing, the adapter deletes the stored session before its first read and then writes
  the marker. Every operation waits for this check. Android deletes Keystore data with the app, and
  the `expo-secure-store` plugin excludes the preferences from Auto Backup.
- **Plugins:** `expo-secure-store` with `faceIDPermission: false` (the session is not behind
  biometrics, so no usage string; passkeys use Face ID through the system sheet, which needs
  none either). `expo-file-system`'s plugin adds `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`,
  which the app never uses (app-private files only): `android.blockedPermissions` removes them.
- **Web:** `expo-secure-store` has no web implementation; the client uses `localStorage`. The key
  stays auth-js's default (`sb-<project-ref>-auth-token`), the PWA's key, so a PWA user is still
  signed in when the new web app takes over the PWA's origin in Phase 7.
- **Alternative: `expo-sqlite` `localStorage`** (Expo's Supabase guide). Not encrypted, and the
  refresh token is a long-lived credential. Rejected.
- **Alternative: an install id in the key instead of deleting.** Leaves the old refresh token in the
  Keychain for good. Rejected.

### The persisted session is read without auth-js, through the same adapter

The PWA adopts the stored session when the refresh is unreachable, reading `localStorage` by key
pattern because the key is private to auth-js. Here the app owns the adapter and computes the key
the way supabase-js does (`sb-${hostname.split('.')[0]}-auth-token`); a test pins it against the
client, so a supabase-js change shows up as a failing test instead of a silent "never adopt".

### Auth store: Zustand, the PWA store's logic

`useAuthStore` (Zustand, D4) holds `user` and `isLoading` and has `initialize`, `sendEmailOtp`,
`verifyOtp` and `signOut`, plus `resendEmailOtp` and the password and passkey actions (below). The logic of the first
four is the PWA store's, minus what the browser needed:

- **`initialize`** waits for the adapter (prewarming, above), then races `getSession()` against
  4 s. A retryable failure (`AuthRetryableFetchError`) or the timeout adopts the stored user if it
  has an id and a refresh token, and sets the session unverified; a permanent failure stays signed
  out. Any unexpected error counts as signed out, and `isLoading` clears in a `finally`, so the
  launch screen always goes. Then it subscribes to `onAuthStateChange`: a delivered session sets
  the user and clears "unverified"; `SIGNED_OUT` clears both; any other event without a session
  changes nothing (auth-js replays the failing load to new listeners). The PWA also adopted when
  `navigator.onLine` was false; native has no such flag in Phase 1, and the error already says it.
- **`signOut`** clears the user at once, so the app shows sign-in without waiting for the network.
  It then calls `signOut({ scope: 'local' })`, which deletes the local session before asking the
  server to revoke it; offline right after launch, auth-js first waits out its startup refresh (up
  to 30 s), so the call is bounded by 4 s and the adapter deletes the stored session afterwards in
  any case, so the next launch cannot adopt it. Storage errors are logged; it never throws.
- **"Unverified"** is a tiny vanilla store in `core/auth/session-trust.ts`, as in the PWA, because
  `core/realtime` (`add-realtime-core`) reads it and `core/` never imports a feature.
- No realtime `setAuth` listener: supabase-js 2.119 passes refreshed tokens to Realtime itself.

### Routes: `Stack.Protected` in the root layout, both directions together

- The root `Stack` wraps the tabs and the sheet routes in `Stack.Protected guard={signedIn}
  redirectTo="/auth"` and the `auth` group in `guard={!signedIn} redirectTo="/"`. While the
  session is restored, the signed-in guard stays open too (`isLoading || signedIn`; sign-in is open
  anyway, nobody being signed in yet), so a deep link that opened the app keeps its route until the
  session is known and is redirected only then. Expo Router
  removes a guarded screen and its history when its guard turns false and goes to `redirectTo`:
  signing in leaves `auth` for the Map, signing out or a server-side sign-out leaves any tab or
  sheet for sign-in. That is the PWA's `beforeEach` guard and `setupAuthRedirect` in one
  declaration, without code that reacts to the auth state.
- Both transitions fade instead of pushing, as iOS does when an app's root changes.
- `auth/_layout.tsx` nests a `Stack` for the two steps. The code screen gets the system navigation
  bar, transparent over the photo, with the system back button (Liquid Glass on iOS 26, the back
  gesture; predictive back on Android). The email screen stays mounted beneath it, so going back
  shows the address as typed. Addresses: `/auth` and `/auth/verify-otp?email=…`; the code screen
  without an email redirects to `/auth`.
- Each step draws the same photo full-bleed, so the push is the system's: the code screen slides
  in over an identical photo. Transparent screens over one shared photo would keep it perfectly
  still, but both cards would show through each other while the push runs.
- **Launch:** `expo-splash-screen` keeps the launch screen until `initialize` settles. The navigator
  renders underneath from the start (Expo Router needs it mounted), so the guard's redirect happens
  under the launch screen, and neither sign-in nor the Map flashes.
- **Alternative: a redirect hook in the root layout** (the PWA's watcher). Two places to keep in
  step, which is how the PWA once stranded users on sign-in. Rejected.

### Sign-in screens: system controls on an opaque card

- **Fields:** React Native's `TextInput` is `UITextField` on iOS. `TextField` in
  `src/core/adaptive` takes a required `label` that becomes the field's accessible name (the
  placeholder is not one). Email: `textContentType` and `autoComplete` `username` (the account's
  name, paired with the password: see "Passwords, account creation and passkeys"), email
  keyboard, no capitalization or correction, the return key moves to the password; the value is
  trimmed (browsers
  strip email whitespace, `TextInput` does not) and checked with the PWA's pattern. Code:
  `oneTimeCode` (iOS offers the code from Mail), number pad, focused on arrival, no `maxLength` so a
  pasted `123 456` is normalized instead of cut; it is not a credential type, so nothing offers to
  save it.
- **Buttons:** `Button` in `src/core/adaptive`. iOS: SwiftUI `Button` with `glassProminent`
  (primary) and `glass` (secondary), large, capsule, tinted with the brand color, disabled natively,
  as #346 section 5 maps `base-button`. Glass on an opaque card is not glass on glass. Android and
  web: Material 3 filled and tonal buttons with the press feedback of the other Material controls.
- **Card:** opaque `background` surface, large radius. The PWA's card is frosted glass over the
  photo. On iOS, glass belongs to controls, and Liquid Glass turns dark over a dark photo while
  React Native text keeps its color, so legibility would depend on the photo.
- **Keyboard:** `KeyboardAvoidingView` pads the screen by the keyboard's height with the keyboard's
  own animation (iOS), so the centred content re-centres in the space left; it scrolls when it does
  not fit (small phones), and dragging it dismisses the keyboard. A scroll view adjusting its
  insets instead would keep the card centred on the full screen, half under the keyboard.
- **Hero:** the PWA's photos, portrait up to 768 px wide and landscape beyond, as the PWA's
  `<picture>` switches; a darkening gradient (`backgroundImage` linear gradient, React Native 0.88);
  light status bar content over it; the product name as the only top-level heading, the screen
  title one level below (web: `h1` and `h2`).
- **Alternative: a SwiftUI `Form`** (`@expo/ui`). The grouped list fits settings, not a branded
  two-step sign-in, and `TextInput` is the same UIKit field. Rejected.

### Errors are localized

The PWA shows `error.message` from Supabase, which is English. AUTH-1 in #346 asks for correct
errors in both languages. The screens map: no connection (an `AuthRetryableFetchError` with status
0) to `offline.actionUnavailable`; the email rate limit (429, `over_email_send_rate_limit`) to a
new "wait n seconds" message on send and to the countdown on resend (PWA), the seconds read from
the server's message; a rejected email to `invalidEmail`; anything else, server errors included, to
the screen's generic message (`sendError`, `verifyError`, `resendError`), logged with the original.
A successful resend clears the rejected code, so a new code that happens to match it still submits.
The resend countdown runs against a deadline, not a decrementing counter, so time the app spent in
the background (reading the code in Mail) counts.

### Config: Zod over `EXPO_PUBLIC_*`

`src/core/env.ts` validates `EXPO_PUBLIC_SUPABASE_URL` (URL with `http` or `https`) and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` once, empty strings counting as unset, and throws naming the
variables. Expo inlines `EXPO_PUBLIC_*` only for literal `process.env.EXPO_PUBLIC_X` reads, so the
module reads each by name. The PWA's push and Worker variables come with their consumers.

### Local backend: no new transport exceptions

The dev variant talks to `supabase start` over HTTP. iOS allows that through
`NSAllowsLocalNetworking`, which Expo's template sets in every build, `prod` included, because debug
builds load their bundle from Metro over HTTP; it covers local addresses only. Android allows
cleartext only in debug builds (the template's debug manifest). So no ATS or cleartext exception is
added. `.env.local` points at `http://127.0.0.1:54321` for the Simulator, at the Mac's address for
a phone, and at `http://10.0.2.2:54321` for the Android emulator (README).

### Passwords, account creation and passkeys (owner, 2026-11-08)

The owner asked for account creation, password sign-in and Face ID sign-in on iOS, in the native
app only, with the email code kept next to them. The code is the PWA's flow, the only way in for
the PWA's users (none has a password) and the answer to a forgotten password.

- **Face ID is a passkey** (owner's choice): a key in iCloud Keychain, unlocked with Face ID in the
  system sheet. Nothing to phish or reuse, synced to the user's Apple devices, Apple's recommended
  sign-in. Supabase Auth has passkeys (beta since 2026-05), and supabase-js 2.119 has the two-step
  API: `auth.passkey.startAuthentication` and `verifyAuthentication`, `startRegistration` and
  `verifyRegistration`, `list`, `delete`. It takes and returns WebAuthn JSON, so the native side
  only runs the ceremony. `verifyAuthentication` saves the session and emits `SIGNED_IN`, so the
  store's listener signs the user in exactly as for a code.
  - **Alternative: password AutoFill as "Face ID".** Face ID then only fills a stored password; it
    comes with the password fields anyway (below). Not a sign-in method of its own.
  - **Alternative: an app lock** (Face ID before a stored session shows). Not a way to sign in.
- **iOS only.** The owner asked for Face ID on iOS. Android and web get password, account creation
  and code. Android passkeys would need Digital Asset Links and an origin per signing certificate;
  web passkeys need the page's origin under the relying party, and the web app runs on
  `tourenbuddy-native.pages.dev` and `localhost` until Phase 7.
- **Native module: `react-native-passkey`** (3.6): `ASAuthorizationController`, WebAuthn JSON in and
  out, normalized errors (`UserCancelled`, `NoCredentials`, `BadConfiguration`,
  `CredentialAlreadyExists`, …) and the iOS 26 Signal API. It is a classic native module, which
  React Native 0.88 runs through its interop layer; `native-build.yml` builds it on this pull
  request because the dependencies change. `react-native.config.js` sets its Android platform to
  `null`, so Expo's autolinking leaves it out of the Android app (no Credential Manager libraries
  shipped for nothing). The JavaScript side only calls it on iOS.
  - **Alternative: `react-native-passkeys`** (an Expo module). It fails to compile against
    ExpoModulesCore since SDK 56 (its open issue #64). Rejected.
  - **Alternative: our own Expo module.** A few hundred lines of Swift that no agent can build or
    run. Rejected.
- **Relying party `tourenbuddy.ch`.** Passkeys stay bound to the RP ID: changing it later makes
  every passkey useless. The apex covers the PWA's origin `test.tourenbuddy.ch` and the planned
  `tourenbuddy.ch`, should web passkeys come (web origins must be the RP ID or its subdomains). iOS
  accepts the RP ID only with `webcredentials:tourenbuddy.ch` in the app's associated domains and an
  `apple-app-site-association` file at `https://tourenbuddy.ch/.well-known/` listing both bundle
  ids with the Team ID. The file lives in `public/.well-known/` (copied into the web export;
  `public/_headers` serves it as JSON). The apex shows Hostinger's parked-domain page today
  (checked 2026-11-08), nothing live; the owner attaches it to the `tourenbuddy-native` Pages
  project, where the web app moves at the cutover anyway. The dev variant declares the domain with
  `?mode=developer`, so Simulator and development builds read the file from the domain instead of
  Apple's CDN, which caches it for up to a day.
- **Backend** (Vue repository's `config.toml` for the local stack, the dashboard for the hosted
  project; owner):
  - `enable_confirmations = true`. Supabase's `/signup` endpoint takes a password from anyone
    holding the public anon key, whatever the clients do; with confirmations off it hands out a
    session for an address nobody proved (the PWA's backend does today). The app itself never calls
    it (below). The PWA is unaffected: a code sign-in confirms a new address by the code.
  - `minimum_password_length = 8` (6 is Supabase's floor). Leaked-password checks need the Pro plan.
  - `[auth.passkey] enabled = true`; `[auth.webauthn]` display name TourenBuddy, RP ID
    `tourenbuddy.ch`, origins `https://tourenbuddy.ch` and `https://test.tourenbuddy.ch` (iOS apps
    sign as `https://<RP ID>`).
  - The email hook Worker sends a code for every email type with a token, so nothing changes there.
  - **An unconfirmed account never holds a password** (owner, 2026-11-08). `/signup` lets anyone
    give a stranger's address a password; once the stranger confirms the address with a code, that
    password would sign in. A trigger on `auth.users`, `before insert or update of
    encrypted_password`, empties the password of any row with neither `email_confirmed_at` nor
    `phone_confirmed_at`. No need to tell creation from a later change: every legitimate password
    is set on a confirmed account (Create account and the Password sheet after the code, the seed's
    confirmed demo users, the dashboard's auto-confirmed users), and `/signup` creates an
    unconfirmed one. Confirming the address later brings nothing back. Supabase's
    `before-user-created` hook cannot do this: its payload does not say whether a password was
    given, and it does not run on updates. The migration, a pgTAP suite and the `config.toml`
    settings go to the Vue repository as one patch (task 7.1).
  - **Release order:** the Vue patch is a fix to the live backend, independent of this change: as
    soon as it is merged there, the owner runs its audit query (who holds a password today), then
    the migration goes to the hosted project together with "Confirm email" (the trigger alone
    protects nothing while `/signup` confirms every address on its own). The same migration drops
    every password that already exists: no client ever set one, so each came from `/signup` or the
    dashboard, and every account keeps signing in with a code. Then the password length and
    passkeys. Builds with the password screens for testers come after that, whenever they are ready
    (task 7.6). The PWA verifies codes as type `email`, which also
    redeems confirmation codes, so it keeps working.

#### Sign-in screen (`/auth`)

- Fields: email with `textContentType` `username` (iOS pairs the account name with the password
  for AutoFill and for saving; `emailAddress` is for contact details) and the email keyboard;
  password (`password`, secure entry), whose return key signs in.
- Actions, top to bottom: **Sign in** (primary, `signInWithPassword`); **Email me a code**
  (secondary, the PWA flow unchanged, the password ignored); **Sign in with passkey** (secondary,
  iOS only; no email needed, the passkey names the account); **Create account** (plain).
- Answers: an empty password asks for one without a call. Wrong email or password
  (`invalid_credentials`, also what an account without a password gets) says so and points at the
  code. `email_not_confirmed` (the password was right, but the account came from `/signup`
  directly and was never confirmed; the app's own flows never leave one) points at the code, which
  confirms the address. Too many attempts (429) and offline are localized. Passkeys: cancelling the
  sheet is silent; no passkey on the device says so; a passkey the server no longer knows
  (`webauthn_credential_not_found`) says so and is reported with `signalUnknownCredential`, so
  iOS 26 stops offering it.

#### Create account (`/auth/sign-up`): the code first, then the password

- Pushed with the system back button. Email (`username`), new password (`newPassword` with
  `passwordRules` `minlength: 8;`: iOS suggests a strong password and offers to save the pair when
  the screen goes), **Create account**.
- Shorter than 8 characters: an error without a call. Otherwise the store's `signUp` requests the
  email code exactly as **Email me a code** does (`signInWithOtp` with the language: it creates the
  account if there is none) and keeps the password in memory, then the code screen opens. When the
  code for that address is verified, `verifyOtp` sets the password (`updateUser`) right after the
  session arrives. New address, existing account (with or without a password) and an account that
  `/signup` left unconfirmed all take this one path, and all end with the password just chosen,
  which matches what iOS saved.
- Owner's choice (2026-11-08): nothing tells whether the address already had an account; the
  screen answers the same either way and nobody waits for a mail that never comes. Setting the
  password of an existing account needs the code from its mailbox, which signs into that account
  anyway.
- **Alternative: Supabase's `signUp`.** It sends nothing for an address that has an account and
  answers with a user without identities, so the screen would either reveal the account or leave
  the user waiting; an unconfirmed account keeps its first password. Rejected.
- The password stays in the store's memory only (never stored, never in a route parameter), for
  that address, until a code for it is verified, the next `signUp` drops it (before its own request,
  so a failed one leaves none), a code sign-in (`sendEmailOtp`, any address) drops it, or sign-out.
  The code screen's Resend goes through `resendEmailOtp`, which keeps it. If
  setting it fails after the code (offline in that second, rejected as weak), the user is signed in
  without it, and an alert says to set it in Profile.
- Resend on the code screen sends a code again; Back returns to this screen as typed. Abandoning
  leaves what the code request created: an unconfirmed account without a password, as the PWA's
  code flow does today.

#### Profile: password and passkeys

- The account section on the Profile tab gets **Password** and, on iOS, **Passkeys** above Sign
  out. Each opens a sheet route (`/password`, `/passkeys`) in the signed-in group, over the Profile
  tab; closing returns to it.
- **Password sheet:** the email in a read-only `username` field (iOS saves the password for that
  account), the new password (`newPassword`, the same rules) and **Save**, which calls
  `updateUser({ password })` and closes the sheet, so iOS offers to save it. Supabase does not say
  whether an account has a password, so the sheet sets it either way. Errors: too short (no call),
  the same password (`same_password`), weak, offline. `secure_password_change` stays off, so no
  reauthentication.
- **Passkeys sheet:** the user's passkeys from `passkey.list`, each with its `friendly_name`
  (Supabase derives it from the authenticator, such as "iCloud Keychain") or "Passkey" when it has
  none, and the date added; **Add passkey** (`startRegistration`, system sheet,
  `verifyRegistration`); Delete per passkey after a system alert. Cancelling is silent; a passkey
  for this account already on the device (`CredentialAlreadyExists`, `webauthn_credential_exists`),
  too many (`too_many_passkeys`) and offline are localized. Deleting removes the passkey on the
  server; the copy in iCloud Keychain stays until the user deletes it in the Passwords app, and
  using it is answered as an unknown passkey (above). The list carries no credential ids, so the
  app cannot signal the remaining set after a delete.

#### Where the code lives

- `features/auth/data/passkeys.ts`: `passkeysSupported` (iOS with `Passkey.isSupported()`), the two
  ceremonies (Supabase options, `Passkey.get` or `Passkey.create`, verify), list and delete, and a
  `PasskeyError` with the reason the screens map: `cancelled`, `noCredentials`,
  `unknownCredential`, `exists`, `tooMany`, `offline`, `failed`.
- `useAuthStore` is the only caller of `data/passkeys.ts` and of the auth API: it gets
  `signInWithPassword`, `signUp`, `signInWithPasskey`, `setPassword`, and `listPasskeys`,
  `addPasskey`, `deletePasskey`, which hold no state (the sheet keeps the list it shows). The user
  still comes only from the listener: `SIGNED_IN` after each sign-in, `USER_UPDATED` after a
  password change.
- `Button` gets a `plain` variant: a borderless SwiftUI button on iOS, a Material text button on
  Android and web.
- `modules/text-input-no-recycle` (iOS): React Native reuses an unmounted `TextInput`'s native
  field for the next one, and a field iOS filled with a strong password stays yellow and locked
  (react/react-native#53050): the code field and the Password sheet took no input. The local Expo
  module answers `+shouldBeRecycled` with NO for text inputs at load time; the cost is a new
  `UITextField` per mount, nothing on screens with a handful of fields.
- Tests replace `react-native-passkey` with a mock (`test/setup.ts`) and extend the Supabase fake.
  Unit tests cannot prove that the module's JSON matches what Supabase verifies; the Simulator
  checks do (task 7.4).

### Process: one pull request for the rest of Phase 1

The owner asked (2026-11-07) for `add-auth-session`, `add-realtime-core` and
`add-release-pipeline` in one pull request, with an independent reviewer's approval standing in for
the per-proposal approval and a manual review of the whole pull request at the end. `AGENTS.md`
keeps one pull request per change as the rule; this is the recorded exception.

## Risks / Trade-offs

- [The 4 s bound marks a slow but online launch as unverified] → The PWA chose this bound for the
  free tier; the next auth event clears the flag, and Phase 1 has no online-only actions that read
  it.
- [Prewarming behaves differently than documented] → Storage waits for the foreground either way;
  task 5.2 has the owner restart the phone and open the app.
- [The marker file is deleted by something other than a reinstall] → It lives in the document
  directory, which iOS and Android never purge; the cost is one more sign-in.
- [supabase-js changes its key formula] → The tripwire test fails.
- [Supabase passkeys are beta; the API may change] → The calls sit in `data/passkeys.ts`, and
  password and code keep working without them.
- [`react-native-passkey` breaks under a later React Native without the interop layer] → CI's native
  build catches it; the fallback is an own Expo module behind the same `data/passkeys.ts`.
- [React Native renames `RCTTextInputComponentView` or fixes #53050 another way] → The module
  logs that it found no class and changes nothing; the 7.3 check (strong password, then the code
  field) catches a returning bug. Remove the module once React Native resets the field itself.
- [The apex does not serve the association file] → Passkey sign-in and registration fail with
  `BadConfiguration`, shown as a generic error; password and code are unaffected. Owner setup step.
- [The RP ID turns out wrong] → Every passkey would have to be registered again. Decided before
  anyone registers one.
- [The trigger misses a path GoTrue uses to write a password] → The pgTAP suite covers insert and
  update; GoTrue writes `auth.users` only through these. A Supabase upgrade that renames the
  columns breaks the migration loudly, not silently.
- [The Vue patch waits for this change] → It must not: task 7.6 ships it to hosted as soon as it
  is merged; until then the PWA's backend has the gap it has today.

## Migration Plan

New install only; no data moves. The owner adds `.env.local`, runs `npm install` and
`npx expo prebuild --clean`, then the Simulator checks in the tasks. For passwords and passkeys,
first the backend settings (local `config.toml`, then the hosted project) and the association file
on the apex; existing accounts keep working and set a password or add a passkey in Profile.
