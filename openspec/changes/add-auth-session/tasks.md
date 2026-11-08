# Tasks

## 1. Config and client

- [x] 1.1 `npx expo install @supabase/supabase-js expo-secure-store expo-file-system zod zustand`; `expo-secure-store` plugin with `faceIDPermission: false`; `android.blockedPermissions` for `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`
- [x] 1.2 `src/core/env.ts`: Zod over `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`; `test/core/env.test.ts` covers missing, empty, schemeless and valid values
- [x] 1.3 `src/core/auth/auth-storage.ts`: Secure Store adapter (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` on every call), nothing before the first foreground, reinstall marker in the document directory; web uses `localStorage`; tests cover a reinstall, a marker that exists, a cold start in the foreground passing at once, a background launch waiting for the foreground, concurrent reads waiting for the check
- [x] 1.4 `src/core/supabase.ts`: the client (secure storage on native, no URL session detection, refresh tied to `AppState`), the storage key as supabase-js computes it; a tripwire test pins the key against the client
- [x] 1.5 `src/core/auth/session-trust.ts`: the unverified flag as a vanilla store

## 2. Auth store

- [x] 2.1 `useAuthStore` (Zustand): `initialize` with the 4 s bound, adoption and a `finally` that always ends loading, the listener rules, `sendEmailOtp` with the base language, `verifyOtp`, `signOut` that clears at once and always deletes; tests port the PWA store's edge cases (retryable vs permanent failure, timeout then late success, replayed null, malformed stored session, storage failure at launch, offline sign-out, storage failure on sign-out)

## 3. Routes and screens

- [x] 3.1 Root layout: `Stack.Protected` with `redirectTo` for the tabs and sheets and for `auth`, fade between them, launch screen held until restore settles
- [x] 3.2 `auth/_layout.tsx` with a nested `Stack`, the code screen with the transparent system navigation bar; `AuthHero` with the photo (portrait up to 768 px), gradient, light status bar, keyboard avoidance and the card
- [x] 3.3 `Button` (SwiftUI `glassProminent` and `glass` on iOS, Material filled and tonal on Android and web) and `TextField` (required accessible label) in `src/core/adaptive`
- [x] 3.4 Email screen and code screen in `features/auth/presentation`: the PWA's email pattern, localized errors, autofill content types, normalize and auto-submit, no resubmit, no overlap, resend cooldown, 429 wait and the attempted code cleared on resend, missing email
- [x] 3.5 Profile tab: signed-in email, sign-out button, unverified notice
- [x] 3.6 New keys in `en` and `de-CH`
- [x] 3.7 Tests: `test/app/auth.test.tsx` (iOS) drives sign-in to the Map and sign-out back, both guard directions, a deep link while signed out, a server-side sign-out on a sheet, launch held while restoring; screen tests cover every scenario of the code and email screens and find the fields by their labels; Android and web tests for the Material button and field; the navigation tests run signed in

## 4. Docs and checks

- [x] 4.1 README: `.env.local` for local Supabase (Simulator, phone, Android emulator) and for the hosted project; `AGENTS.md`: auth, session storage, protected routes
- [x] 4.2 `npm run check`, web export, `openspec validate add-auth-session --strict`, `npx expo-doctor`

## 5. Owner checks (iOS Simulator first)

- [ ] 5.1 `npm install`, `npx expo prebuild --clean`, `.env.local`, `npm run ios`: launch screen until the session is known; email screen over the photo with light status bar text; email autofill offered; Send pushes the code screen with the system back button; the code from Mail offered above the keyboard (on a device) and signing in on its own; wrong code shows the localized error and clears; Resend counts down from 60; signing in succeeds, so the Keychain took the whole session (about 3 KB)
- [ ] 5.2 Kill and relaunch: straight to the Map. Airplane mode, relaunch after the access token expired (1 h): Map, Profile says signed in offline. Sign out offline: email screen, relaunch stays signed out. On a device: restart the phone, wait a minute without unlocking, unlock and open the app: still signed in
- [ ] 5.3 Delete and reinstall the app: email screen
- [ ] 5.4 Keyboard on an iPhone SE: field and button stay visible; German strings after switching the app language

## 6. Password, account creation and passkeys (owner, 2026-11-08)

- [x] 6.1 `npx expo install react-native-passkey`; `react-native.config.js` leaves it out of Android; `app.config.ts` associated domain `webcredentials:tourenbuddy.ch` (dev variant `?mode=developer`); `public/.well-known/apple-app-site-association` with the Team ID left for the owner and `public/_headers` serving it as JSON, with the PWA's anti-framing and no-sniff headers for every path; the web export contains both
- [x] 6.2 `features/auth/data/passkeys.ts`: `passkeysSupported` (iOS only), sign-in and registration ceremonies over `auth.passkey`, list, delete, `PasskeyError` reasons, `signalUnknownCredential` for a credential the server no longer knows; `react-native-passkey` mocked in `test/setup.ts`; tests cover each reason, a server error before and after the sheet, and that cancelling never reaches verify
- [x] 6.3 `useAuthStore` (the only caller of the auth API and `data/passkeys.ts`): `signInWithPassword`, `signUp` (code request with the language, password kept in memory for that address), `verifyOtp` setting that password after the session arrives (not for another address; forgotten on sign-out, on the next `signUp` even when its request fails, and on a code sign-in for any address; kept through the code screen's resend, `resendEmailOtp`; a failure reported to the caller), `signInWithPasskey`, `setPassword`, `listPasskeys`, `addPasskey`, `deletePasskey`, and the `PasskeyItem` type for the Passkeys sheet; the Supabase fake gains the calls; tests for each of these and for errors passing through
- [x] 6.4 `Button` `plain` variant (iOS borderless, Material text button); Android and web tests
- [x] 6.5 Sign-in screen (`/auth`): email as `username`, password, Sign in, Email me a code, Sign in with passkey (iOS only), Create account; empty password, wrong credentials, unconfirmed account, rate limit, offline, no overlap; passkey cancel, none, unknown
- [x] 6.6 Create account screen (`/auth/sign-up`): `newPassword` with `passwordRules`, at least 8 characters, code request errors as on sign-in, no overlap; success opens the code screen, back returns to it as typed; the code screen alerts when the password could not be set
- [x] 6.7 Profile: Password entry and, on iOS, Passkeys entry; `/password` sheet (read-only account name, new password, same/weak/short/offline, closes on success) and `/passkeys` sheet (list with name or "Passkey" and date, add, delete after a system alert, cancel silent, already on device, too many, offline); both routes in the signed-in group
- [x] 6.8 New keys in `en` and `de-CH`; `test/app/auth.test.tsx` covers password sign-in to the Map and account creation through the code to the Map with the password set; the Android and web tests check the password field types and that no passkey action shows
- [x] 6.9 README (local backend settings, Simulator Face ID and passkeys), `docs/publishing.md` (backend settings for the hosted project, the apex serving the association file, the Team ID), `AGENTS.md` (sign-in methods; screens reach auth and passkeys only through the store)
- [x] 6.10 `npm run check`, web export, `openspec validate add-auth-session --strict`, `npx expo-doctor`

## 7. Owner setup and checks for passwords and passkeys

- [ ] 7.1 Vue repository, on a branch from `main`: `git apply <this checkout>/.vue-patch/unconfirmed-accounts-hold-no-password.patch` (git-excluded here; with both checkouts side by side `../tourenbuddy-native/.vue-patch/…`; migration emptying passwords of unconfirmed accounts, pgTAP suite, `config.toml` with `enable_confirmations = true`, `minimum_password_length = 8`, `[auth.passkey]` and `[auth.webauthn]`, its OpenSpec change), `supabase db reset && supabase test db`, `supabase stop && supabase start`; pull request there
- [ ] 7.2 Team ID in `apple-app-site-association`; confirm the apex still shows only the parked page, then attach `tourenbuddy.ch` to the `tourenbuddy-native` Pages project; `curl -i https://tourenbuddy.ch/.well-known/apple-app-site-association` answers 200 with the JSON and no redirect
- [ ] 7.3 Simulator: Create account with the suggested strong password, iOS offers to save it, the code from Mailpit signs in; sign out; the saved password fills both fields and signs in; Create account again for the same address with another password: the same code screen, and afterwards the new password works; a wrong password shows the error; Email me a code still works
- [ ] 7.4 Passkeys on the Simulator (dev build, which reads the association file directly through `?mode=developer`; Features → Face ID → Enrolled; signed in to an Apple Account with iCloud Keychain if the sheet asks): Profile → Passkeys → Add passkey, Features → Face ID → Matching Face: listed with a name and date, which proves the module's JSON matches what Supabase verifies; sign out; Sign in with passkey signs in; cancel the sheet: no error; delete it in Profile, sign out, sign in with it: no longer valid
- [ ] 7.5 Profile → Password on an account created with a code: set one, sign out, sign in with it
- [ ] 7.6 Hosted project, as soon as the Vue pull request of 7.1 is merged and independent of this change: the audit query from the Vue change's design (accounts holding a password) and a look at the list, then the migration (`supabase db push` from the Vue repository, which also drops every existing password) and "Confirm email" on together, then the minimum password length and passkeys (dashboard, as in 7.1); builds with the password screens reach testers only after that
