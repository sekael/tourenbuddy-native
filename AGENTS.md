# TourenBuddy Native Agent Guide

Canonical project context for all coding agents working in this repository.

## Project

TourenBuddy is a tour-planning app. Users pin tour objectives on a Swiss topo map (Swisstopo), link
contacts, and pick planned dates. This repository holds the iOS and Android apps (iOS first) and the
web app, built with React Native and Expo. The web app is a line-by-line port of the Vue PWA
(`sekael/tourenbuddy_frontend_vue`, release 0.54.0; change `port-pwa-web`): same design and features,
also what Android users run until the Android app ships. It deploys to pull-request previews, and
to production once the repository variable `WEB_DEPLOY` is on (the cutover, #374). The backend lives
here too (change `move-backend`): the Supabase schema in `supabase/`, the Cloudflare Worker in
`services/email-hook/`, the ski-route data job in `scripts/ski-routes/`.

The plan lives in that repo's issues: epic sekael/tourenbuddy_frontend_vue#346 (decision IDs
D1–D20, risks, architecture) and one issue per phase, #367 (Phase 0, done) to #374 in the same repo.
Issue numbers in this file refer to that repo; its open issues move here when it is archived
(`docs/vue-repo-migration.md`, B), and their old links redirect. New issues are filed here. Read the
phase issue before proposing work in it.

## Stack

Decided or default in #346. Versions come from `npx expo install`; `package-lock.json` pins them.

- **Framework:** React Native + Expo (SDK 58, React Native 0.88), TypeScript, Hermes
- **Native projects:** Continuous Native Generation; `ios/` and `android/` are generated, never committed
- **Routing:** Expo Router (file-based), auth redirects in one place
- **State and local data:** Zustand; `expo-sqlite` (offline outbox), `expo-file-system`
- **Backend:** Supabase through `@supabase/supabase-js`, session in `expo-secure-store`. Schema,
  migrations, seed and pgTAP tests in `supabase/`; the Cloudflare Worker (auth email hook,
  notifications and push, calendar feed, moderation, account deletion) in `services/email-hook/`,
  its own npm package. Both moved unchanged from the Vue repo and keep its code style: the app's
  lint, type check and Jest skip them (Database and Worker)
- **Map:** `@maplibre/maplibre-react-native` on iOS and Android, `maplibre-gl` on web (`.web.tsx`),
  Swisstopo tiles (free, no API key)
- **UI:** small in-house adaptive component layer (D5) in `src/core/adaptive/`: one iOS
  (`*.ios.tsx`) and one Material implementation per component, the Material one shared by Android
  and web, plus `*.web.tsx` where web differs. iOS: system components first (tab bar, sheets,
  menus), `@expo/ui` SwiftUI for glass controls and menus (glass on a `Menu` via
  `buttonStyle('glass')`: `glassEffect()` leaves a halo as it closes), `expo-glass-effect` for
  floating map controls (D6). iOS 26 minimum, so no non-glass fallback. Navigation: Map · Calendar ·
  Contacts · Profile in the system tab bar (`NativeTabs` on iOS and Android); on the Map tab only,
  one row of map controls in the thumb zone right above it (search, the "My Tours | Add tour"
  capsule, the map button opening map layers with previews, the legend and offline maps); other
  destinations as sheet routes. Icons are the PWA's Material Symbols on every platform (SF Symbols
  only where the system draws: menus, the tab bar, swipe actions)
- **Web app:** the PWA's components in React DOM (`features/<f>/presentation/web/`, `core/web/`,
  routes `src/routes/**/*.web.tsx`), CSS Modules extracted from the Vue styles, the PWA's `web`
  i18n namespace; below the presentation it shares the domain, data and stores with the native apps.
  Service worker `src/sw.web.ts` (Workbox) bundled by `scripts/build-sw.mjs`; offline tables on
  IndexedDB (`tables.web.ts`); Web Push
- **Fonts and icons:** iOS system font; Android embedded Inter, web a bundled Inter
  subset; Material Symbols drawn as SVG on every platform. Icons come from the registry in
  `src/core/adaptive/icons.ts`. No runtime font downloads from third parties
- **Validation:** Zod. **i18n:** `i18next` + `react-i18next`, locale from `expo-localization`
- **Tooling:** ESLint (`eslint-config-expo`) with Prettier, Jest (`jest-expo`) with React Native
  Testing Library (DOM Testing Library for web-only tests)
- **Builds and releases:** EAS Build and EAS Submit, release-please

## Structure

```text
src/
  app/          Expo Router routes and layouts only; screens come from features/ and core/
  core/         shared infrastructure (adaptive/, i18n/, logging/, theme/, later offline/, realtime/)
  features/     <feature>/data, domain, presentation
  locales/      en.json, de-CH.json
  routes/       routes that differ per platform: `<path>.tsx` (native) and `<path>.web.tsx`,
                re-exported by `app/<path>.tsx`
test/           Jest tests, mirroring src/ (src/core/i18n/detect.ts → test/core/i18n/detect.test.ts)
assets/         images/ (app icon, launch image, favicon), fonts/ (web Inter subset)
modules/        local Expo modules (native code the app config cannot express)
openspec/       specs and changes
scripts/        build helpers; ski-routes/ builds the ski-route dataset (weekly workflow)
supabase/       config.toml, migrations/ (immutable), seed.sql, tests/ (pgTAP)
services/
  email-hook/   Cloudflare Worker, own package.json and Vitest suite
```

## Variants

`app.config.ts` builds the `dev` variant ("TourenBuddy Dev", `ch.tourenbuddy.app.dev`) unless
`APP_VARIANT=prod` selects the store identity (`ch.tourenbuddy.app`). Both install side by side.
Switching changes the bundle identifier: run `npx expo prebuild --clean` afterwards.

## Must Follow

- IMPORTANT: For any new feature or non-trivial change, use spec-driven development with OpenSpec:
  propose the change, wait for explicit owner approval before implementing, then prompt the owner
  to archive it. Each change reaches `main` through its own pull request.
- A simple task touching more than 3 files still gets a brief plan.
- Branch from latest `main` (`feat/<issue>-<description>` or `fix/<issue>-<description>`). Never
  commit to `main`.
- Never run `git commit`; give the owner a ready-to-copy conventional commit message
  (`type(scope): description`).
- Do not edit `CHANGELOG.md` or the package version manually (release-please).
- Expo changes every SDK release: do not trust training data. Read the `expo` major version in
  `package.json`, then use the matching docs (`https://docs.expo.dev/versions/v<major>.0.0/`) and
  `https://docs.expo.dev/llms.txt`.
- Add packages with `npx expo install <package>` (SDK-compatible versions). Prefer a platform
  feature, an Expo module or a few lines of code over a new dependency.
- Configure native behavior in the app config and config plugins, never by editing `ios/` or
  `android/`.
- Keep the layers: Presentation → Domain → Data → External. Domain has no React or React Native
  imports, features never import each other's internals, `core/` never depends on features.
  Web-only files use the `.web.tsx` suffix, never under `src/app`: every platform bundles all of
  it (a web route once broke the iOS build), so a route that differs lives in `src/routes/`
  (`test/app/platform-routes.test.ts` enforces it). Until polish merges them, a feature change
  touches both presentation layers: the native one and the web port (`presentation/web/`), which
  keeps the PWA's design.
- Code ported from the Vue repo's `domain` and `data` layers stays plain TypeScript, so it and its
  tests move over nearly unchanged.
- User-facing text goes through `i18next` and every locale file. Catalogs use i18next syntax:
  `{{name}}` placeholders and plural keys `_one` / `_other` (plus `_zero` when 0 reads
  differently), called by the base key with `count`. Keys are typed against `en.json`.
- No `console` calls; use `createLogger('<tag>')` from `@/core/logging/logger` (lint enforces it).
- Tests cover edge cases and failures, not the happy path. Ported Vitest tests: `vi.` → `jest.`, drop
  the `vitest` import. React Native Testing Library v14 is async: `await render(...)`,
  `await fireEvent.press(...)`.
- Jest runs tests as iOS. `*.test.android.tsx` runs the Material components (`*.tsx`, shared with
  web) with React Native Testing Library; `*.test.web.tsx` runs web-only behavior (`*.web.tsx`)
  with the DOM Testing Library. `Animated` finishes at once under test: hold `Animated.timing` to
  test an interrupted animation. Jest renders SwiftUI as inert views carrying their props: press
  them with `fireEvent(node, 'buttonPress')` and read their modifiers (see
  `test/app/navigation.test.tsx`); how they look and feel is checked in the Simulator.
- Jest compiles with the React Compiler, as Metro does, so its memoization runs under test. A
  layout that renders `NavigationContent` from `expo-router/ui` hooks opts out with
  `'use no memo'`, or its tabs never update.
- Colors, spacing, type and motion come from `@/core/theme/tokens` (semantic roles, never the
  palette or literals); text uses `Text` from `@/core/adaptive/text`. Honor Reduce Motion
  (`useReducedMotion`): no travel, overshoot or press scaling.
- Run `npm run check` (lint, type check, tests) before declaring a task done.
- Agents cannot build or run the iOS and Android apps; the owner builds and measures on a Mac and
  devices. Give exact commands and what to look for.

## Session, Realtime and releases

- The signed-in user comes from `useAuthStore` (`features/auth/presentation/stores`). Only the
  store writes `user` (restore, its `onAuthStateChange` listener, sign-out); screens call its
  actions and never set it. Read
  `sessionTrust` (`core/auth/session-trust.ts`) to tell an unverified session (offline launch)
  from a confirmed one.
- The session lives in the Keychain and Keystore through `core/auth/auth-storage.ts` (web:
  `localStorage`). Nothing else reads or writes it; `core/supabase.ts` is the only client.
- Sign-in: password, email code (the PWA's flow) and, on iOS only, passkeys (Face ID). Screens reach
  the auth API and `features/auth/data/passkeys.ts` only through the store's actions; they may read
  its `passkeysSupported` and `PasskeyError`. Create account sends the code first and sets the
  password after it (`signUp`, `verifyOtp`), so it never tells whether an address has an account.
  The relying party `tourenbuddy.ch` is permanent; the backend's auth settings: `docs/publishing.md`.
- Routes follow the session in one place: the two `Stack.Protected` groups in
  `src/routes/_layout.tsx`. A new signed-in route goes inside the first group, never behind its own
  redirect.
- Realtime only through `subscribeRealtime` (`@/core/realtime/subscribe`), and only to keep what
  the app shows current, never for notifications. A store subscribes in an action and calls the
  returned function in its `clear()` on sign-out.
- Tests never reach Supabase or the Keychain: `test/setup.ts` swaps `@/core/supabase` and
  `@/core/auth/auth-storage` for the fakes in `test/support/`. `signIn()` and `resetAuth()` from
  `test/support/auth.ts` set the session.
- Local backend and env variables: README, "Backend". Releases (release-please, EAS, Pages) and
  their one-time setup: `docs/publishing.md`.

## Database and Worker

- IMPORTANT: every database change (schema, RLS, functions, triggers, storage policies, buckets,
  extensions) goes to the LOCAL stack first, never to production directly, and never through
  Studio or the SQL editor (the schema would drift from the repo). `supabase start`, then
  `supabase migration new <name>`, edit `supabase/migrations/<timestamp>_<name>.sql`, apply with
  `supabase migration up` or `supabase db reset`, verify against the local stack. Production gets it
  with `supabase db push` only after review, run by the owner: never run it, or `db reset`,
  unprompted.
- CRITICAL: never edit an existing migration, the baseline `20260101000000_initial_schema.sql`
  included: history is immutable, fix forward in a new file. `migrations/_archived/` holds the
  pre-baseline patches, never run. Sole exception, the replay fix: a migration that no longer replays
  on a fresh database (an upstream image change) may be edited in place only if it produces the same
  end state as the original did on production (`db push` matches by version, never content); verify
  with `supabase db reset` and `supabase migration list --linked` (Local = Remote, nothing pending),
  and comment the edit (precedent: `20260608062430_friend_tours_realtime_messages_policy.sql`).
- Never `alter table` Supabase-owned tables (`realtime.*`, `auth.*`, `storage.*`); policy
  statements are fine. Never add `[db.vault]` to `supabase/config.toml`: `db push` would overwrite
  production's Vault with local values. Vault secrets are set by hand per database
  (`services/email-hook/SETUP-NOTIFICATIONS.md`).
- Every `create table` in `public` grants the Data API in the same file
  (`grant all on table public.<name> to anon, authenticated, service_role;`), or PostgREST can't see
  it. RLS still decides the rows.
- Functions are not executable by clients unless granted: `grant execute on function
  public.<fn>(<args>) to authenticated;` in the migration that creates it. Helpers called only from
  other definer functions or triggers get no client grant. Every `security definer` function sets
  `search_path`, and every client-callable one authorizes the caller itself (`auth.uid()`).
- Views are `with (security_invoker = true)`, `select` only (`revoke all … from anon,
  authenticated; grant select … to authenticated`). Storage read grants that match an object by a
  path stored in a row also pin the owner prefix (`split_part(name, '/', 1) = <owner>::text`).
  Background and a worked example: `docs/supabase-rpc-authorization.md`.
- Notifications are recorded by the database: the writing transaction inserts the inbox row
  (`public.notifications`), and a dispatch trigger hands it to the Worker, which sends push and
  email. Clients never send notifications (`docs/notifications.md`).
- IMPORTANT, expand then contract (#346 B5): store builds keep calling the backend for months. Never
  rename, drop, or change the arguments or result shape of an RPC, table, column, view or Worker
  route in one step: add the new shape next to the old one, ship the clients, raise
  `min_supported_ios` / `min_supported_android` in `public/app-config.json` once old builds are
  rare, and drop the old shape in a later migration only after that gate is live and old offline
  queues have drained (`docs/publishing.md`, "Update gate"). The web app is a client too.
- The Worker deploys by hand, never in CI: any change to `services/email-hook/` (code,
  dependencies, `wrangler.toml`, secrets) needs `cd services/email-hook && npx wrangler@latest
  deploy`, and a change's tasks that touch it include that step. Secrets: `SETUP-NOTIFICATIONS.md`
  there (`wrangler secret put`).
- Tests: pgTAP suites in `supabase/tests/` (`supabase db reset && supabase test db`; they assume the
  pristine seed and roll back). The Worker: `cd services/email-hook && npm test`, also in CI when it
  changes (`worker.yml`). Ski-route data: `docs/ski-route-data.md`.

## Commands

```bash
npm start                      # dev server for an installed dev build
npm run ios                    # build and run the dev app on a simulator or device
npm run android
npm run web
npm run check                  # lint + type check + tests, as in CI
npm run lint                   # zero warnings; `npx expo lint --fix` formats
npm run typecheck              # generates route types first, then tsc
npm test                       # Jest
npm run build:web              # web build with the service worker, as in CI (dist/)
npx expo install <package>     # add a dependency
npx expo prebuild --clean      # regenerate ios/ and android/ after config or variant changes
npx expo-doctor                # dependency and config check
supabase start                 # local backend (Docker); Mailpit at http://127.0.0.1:54324
supabase db reset && supabase test db   # replay migrations and seed, run the pgTAP suites
(cd services/email-hook && npm test)    # Worker tests; `npx wrangler dev` runs it on :8787
```

## Important Context

- Phase 0 findings (native map images, cluster properties on iOS, measured limits):
  https://github.com/sekael/tourenbuddy_frontend_vue/issues/367#issuecomment-6683373291
- `openspec/specs` was copied unchanged from the Vue repo at its parity baseline
  `tourenbuddy-frontend-v0.52.0`. Until the change that ports a capability rewrites its spec, the
  spec describes the Vue PWA: read it as the product behavior to match, not as implementation
  instructions.
- Focus is the iOS app. The owner tests mostly in iOS Simulators and checks on a real iPhone 15
  before releases. Android is not prioritized for now: keep it building and correct, but polish
  and device checks wait. Write device instructions for the Simulator first.
- Supabase free tier: expect higher auth latency.
- Backlog: https://github.com/users/sekael/projects/1
- Values: thoughtful development, understand before changing, small reviewable PRs.
