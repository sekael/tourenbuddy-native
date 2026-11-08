# Proposal

## Why

The shell from `add-adaptive-ui` opens straight onto the tabs, for anyone. Every feature port
reads and writes the user's own rows through Supabase, so the app needs a signed-in user first:
Phase 1's exit criterion is "sign-in works and an empty shell runs" (sekael/tourenbuddy_frontend_vue#368).
The Vue app's sign-in is an email code, with no password and no redirect, and it keeps a user signed
in when a token refresh fails offline (`session-trust`). The native app has to match that, with
the session in the device's secure storage instead of `localStorage`.

## What Changes

- **Config:** the Supabase URL and anon key come from `EXPO_PUBLIC_*` variables, validated with Zod
  when the app starts; a missing or malformed value stops the app with a message naming it.
- **Supabase client:** one shared client. On iOS and Android the session lives in the Keychain and
  the Android Keystore (`expo-secure-store`), on this device only (never in a backup restored
  elsewhere) and readable once the phone has been unlocked after a restart. Nothing reads it before
  the app has been in the foreground once, so a background launch before the first unlock (iOS
  prewarming) does not read as signed out. The first launch after a reinstall clears a session the
  iOS Keychain kept from the previous install. Web keeps the browser's storage under the key the
  PWA uses, so PWA users stay signed in at the cutover. Token refresh runs while the app is in the
  foreground.
- **Sign-in, the Vue flow:** an email screen and a code screen over the PWA's hero photo. The code
  field takes the system's one-time-code autofill (iOS offers the code from Mail), keeps digits
  only, submits itself at six digits, never resubmits a rejected code unchanged and never overlaps
  two requests. Resend is cooling down for 60 s and follows the server's rate limit. The email goes
  out with the user's language (`en` or `de`).
- **Native iOS design:** system text fields with email and one-time-code content types, system
  buttons in Liquid Glass (prominent glass for the main action, as #346 section 5 maps buttons), the
  navigation bar's back button from the code screen to the email screen (swipe back works), light
  status bar over the photo, and the keyboard never covering the field or the button. The form sits
  on an opaque card, because content stays opaque (#346 section 5); the PWA's frosted card becomes
  this card.
- **Errors in the user's language:** the PWA shows Supabase's English messages; the app maps them
  to localized ones (wrong or expired code, too many requests with the wait, offline, generic).
- **Session restore:** the launch screen stays until the session is known, at most 4 s, as the PWA
  waits before mounting. A refresh that fails retryably (offline, timeout) keeps the user signed in
  on the stored session and marks it unverified; a permanent failure signs out. Only auth events
  that deliver a session, or an explicit sign-out, change the signed-in user.
- **Routes:** protected routes in one place, both directions: signed out, every address leads to
  sign-in; signed in, the sign-in screens are gone and the app lands on the Map. A session that
  arrives or ends while the app is open moves the user without a tap. As in the PWA, a link opened
  while signed out is not kept across sign-in.
- **Sign out:** on the Profile tab, under the signed-in email, until the profile port; it shows
  sign-in at once, works offline and never fails. While the session is unverified, the Profile tab says the user is
  signed in offline and data may be out of date.
- **Adaptive components:** `Button` (iOS: SwiftUI system button; Android and web: Material 3
  filled and tonal buttons) and `TextField` (the system text field, styled per platform).

Deferred, each to the change that brings its data:

- The onboarding gate (name entry for new users) and loading the profile before leaving sign-in:
  the profile port (#370), with the rule that an unknown profile never routes to onboarding.
- The offline bar and its unverified-session wording: the offline data port; until then the
  Profile tab shows the notice.
- Removing the push token and clearing cached data and the outbox on sign-out: push (B1) and the
  offline port, which bring the token, the caches and the outbox.
- Account deletion (B2), the forced-update gate (D15).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `auth`: the sign-in screens, session restore, the guards and sign-out, rewritten from Vue Router,
  Pinia and `localStorage` to the app's routes and secure storage; errors localized; the native
  design of the sign-in screens. The profile-completeness parts of the guard move to
  `profile-onboarding`.
- `profile-onboarding`: takes over the PWA's profile-completeness scenarios from `auth` unchanged,
  for the profile port (#370).
- `app-navigation`: the tabs and destinations are for a signed-in user; sign-in comes first.
- `project-scaffolding`: the validated environment and the shared Supabase client, rewritten for
  `EXPO_PUBLIC_*` variables and secure session storage.

## Impact

- Repository `sekael/tourenbuddy-native`, branch `feat/368-auth-realtime-release`. At the owner's
  request (2026-11-07) this change, `add-realtime-core` and `add-release-pipeline` go into one pull
  request, approved by an independent reviewer before implementation and reviewed by the owner as
  a whole at the end: a recorded exception to one pull request per change.
- New dependencies (`npx expo install`): `@supabase/supabase-js`, `expo-secure-store`,
  `expo-file-system`, `zod`, `zustand`.
- New config plugin `expo-secure-store` (`faceIDPermission: false`; Android backup excludes the
  session); `android.blockedPermissions` removes the external-storage permissions
  `expo-file-system`'s plugin adds. Run `npm install` and `npx expo prebuild --clean` before the
  next dev build.
- New assets: the PWA's hero photos (`background-mobile.webp`, `background-desktop.webp`).
- Local development needs `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in
  `.env.local` (README). No backend change.
