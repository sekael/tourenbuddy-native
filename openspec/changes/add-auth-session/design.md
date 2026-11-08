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

**Non-Goals:**

- Profile, onboarding, push, offline caches, the outbox, account deletion (see the proposal).
- Sign in with Apple or passkeys: no third-party login exists, so Apple 4.8 does not apply (#346
  section 9).
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
- **Plugins:** `expo-secure-store` with `faceIDPermission: false` (no biometrics, so no usage
  string). `expo-file-system`'s plugin adds `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`,
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
`verifyOtp` and `signOut`. The logic is the PWA store's, minus what the browser needed:

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
  placeholder is not one). Email: `textContentType` `emailAddress`, `autoComplete` `email`, email
  keyboard, no capitalization or correction, the return key sends; the value is trimmed (browsers
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

## Migration Plan

New install only; no data moves. The owner adds `.env.local`, runs `npm install` and
`npx expo prebuild --clean`, then the Simulator checks in the tasks.
