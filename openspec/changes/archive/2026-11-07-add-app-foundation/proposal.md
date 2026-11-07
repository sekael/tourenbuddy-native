# Proposal

## Why

Phase 0 gave the go for Expo (sekael/tourenbuddy_frontend_vue#367), and `main` holds only a README
and `AGENTS.md`. Every feature port in Phase 3 needs the same base first: a buildable universal
app, a dev and a prod identity, checks that run on every pull request, the existing translations,
and logging. This change lays that base and nothing that a later change can add with its first
consumer.

Phase 1 (#368) is split into five changes, each its own pull request into `main`:

1. **`add-app-foundation`** (this change): project, variants, tooling, PR checks, i18n, logging,
   launch screen and icon, an empty shell, and the product specs copied from the Vue repo.
2. **`add-adaptive-ui`**: tokens and color scheme (D12), fonts and icon registry (D11), the adaptive
   components from #346 section 5 (sheet, dialog, drawer, responsive overlay, buttons), the desktop
   web layout (D8). Needs the owner's app navigation decision first.
3. **`add-auth-session`**: Zod-validated `EXPO_PUBLIC_*` config, Supabase client with the session in
   secure storage (wiped on first run after reinstall), protected routes with both redirect
   directions in one place, email OTP sign-in, offline-adopted sessions, local backend access in
   the `dev` variant only.
4. **`add-realtime-core`**: shared refcounted channels, 150 ms debounce, `AppState` pause, refetch on
   subscribe.
5. **`add-release-pipeline`**: EAS Build and Submit, release-please, CI build numbers, native build
   smoke, web deploy and PR previews on Cloudflare Pages, TestFlight and the Play internal track,
   and a review of the permissions merged into release builds.
   Needs the owner's Apple, Google, Firebase and Cloudflare setup.

## What Changes

- New Expo SDK 58 TypeScript app with Expo Router and Continuous Native Generation; `ios/` and
  `android/` are never committed.
- `app.config.ts` with two variants: `dev` (default, `ch.tourenbuddy.app.dev`, "TourenBuddy Dev")
  and `prod` (`APP_VARIANT=prod`, `ch.tourenbuddy.app`), installable side by side. iOS 26 minimum
  (D7), light appearance only (D12), Android predictive back, encryption export declaration.
- Launch screen and app icon from the 2048 px winter icon master.
- Tooling: ESLint with Prettier at zero warnings, `tsc`, Jest with the Expo preset and React Native
  Testing Library. One `npm run check` runs all of them.
- GitHub Actions PR checks: lint, type check, tests (including the locale checks) and a web export.
- i18n: both Vue catalogs (`en`, `de-CH`, 1,061 keys; 1,079 after splitting the 12 plurals)
  converted to i18next format; type-checked
  keys; locale from the device (per-app language included) and re-read when it changes; locale
  checks for key parity, placeholder parity and leftover vue-i18n syntax.
- Logger wrapping the console; release builds drop `debug` and `info`; lint bans `console`
  elsewhere.
- Empty shell screen with the app name and a localized tagline.
- `openspec/` initialised, with all 64 product specs copied unchanged from the Vue repo at the parity
  baseline `tourenbuddy-frontend-v0.52.0` (commit `d650886`). Until a capability is ported, its
  spec describes the Vue PWA.
- `AGENTS.md` gains structure, testing and variant rules; the README gets the setup steps.

## Capabilities

### New Capabilities

None. Both capabilities this change touches already exist in the copied specs.

### Modified Capabilities

- `project-scaffolding`: Vite project, consola logger and the old directory layout replaced by the
  Expo app, variants, generated native projects, the console logger, PR checks and the launch
  screen. Environment validation, the Supabase client and design tokens stay as they are until
  `add-auth-session` and `add-adaptive-ui`.
- `i18n`: locale detection reads the device's preferred languages and follows changes while
  running; per-app language in system settings; plural and placeholder behavior; the locale checks
  also cover placeholders and leftover vue-i18n syntax. Persistence, the locale store, switching
  and formatting helpers stay as they are until the profile port.

## Impact

- Repository `sekael/tourenbuddy-native`, branch `feat/368-app-foundation`.
- New dependencies (all through `npx expo install`): `expo-router`, `expo-dev-client`,
  `expo-localization`, `expo-splash-screen`, `expo-system-ui`, `expo-build-properties`,
  `react-native-screens`, `react-native-safe-area-context`, `react-native-web`, `react-dom`,
  `i18next`, `react-i18next`; dev: ESLint, Prettier, Jest, `jest-expo`, React Native Testing
  Library.
- The spike's untracked `ios/` folder (bundle id `ch.tourenbuddy.spike`) must be regenerated with
  `npx expo prebuild --clean` before the first dev build.
- No backend change.
