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
