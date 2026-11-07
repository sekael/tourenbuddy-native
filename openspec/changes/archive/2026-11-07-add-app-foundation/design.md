# Design

## Context

`main` holds a README and `AGENTS.md`. The spike branch `spike/route-gate` proved the stack (Expo SDK
58, React Native 0.88, Expo Router, Hermes, iOS 26 floor) but is never merged; nothing is copied
from it except versions and the lessons in the Phase 0 findings. The Vue repo stays the source of
the translations and product specs; its parity baseline is `tourenbuddy-frontend-v0.52.0`.

Agents work in a Linux container and cannot build or run the native apps. Everything this change
verifies automatically must therefore run in Node: lint, type check, Jest and the web export. The
owner verifies the native result on a Mac and devices.

## Goals / Non-Goals

**Goals:**

- A clean SDK 58 project that the next four Phase 1 changes extend without reshuffling.
- One command (`npm run check`) that a developer, an agent and CI all run.
- First paint already localized and in the final colors, so launch has no flicker.

**Non-Goals:**

- Design tokens, fonts, icons, adaptive components, navigation (`add-adaptive-ui`).
- Environment config, Supabase, auth and the local-backend exceptions (`add-auth-session`).
- EAS, signing, release-please, native build smoke, Cloudflare Pages (`add-release-pipeline`).
- An in-app language picker and the persisted locale (profile port in Phase 3).
- Dark mode (D12).

## Decisions

### Routes under `src/app`

The SDK 58 template puts routes in `src/app`, and the spike did the same. #346 section 4 sketched a
root `app/`; `src/app` keeps every source file under one root, matches the docs and examples, and
the `@/` alias covers it. Route files stay thin: they compose screens from `features/` and `core/`.
The root layout renders a plain `Slot`: stack, tabs or sheets are the app navigation decision in
`add-adaptive-ui`, and the shell does not pre-empt it.

### Variant by `APP_VARIANT`, `dev` by default

`app.config.ts` reads `APP_VARIANT`. Anything other than `prod` builds the dev identity
(`ch.tourenbuddy.app.dev`, "TourenBuddy Dev", scheme `tourenbuddy-dev`).

- **Alternative: default to prod**, as in Expo's variants tutorial. Rejected: then a plain
  `npx expo run:ios` on a developer machine produces the store identity, and with the backend
  selection in `add-auth-session` it could talk to production by accident. The release pipeline
  sets `APP_VARIANT=prod` explicitly in its EAS profile.
- Variant and backend are separate on purpose. SDK 58 loads `.env.development` or
  `.env.production` by build mode only (`NODE_ENV` is no longer user-settable), so the backend
  follows the mode and the variant only decides the native identity.
- Switching the variant changes the bundle identifier, so the native projects must be regenerated
  (`npx expo prebuild --clean`). The README says so.

### Development builds with `expo-dev-client`

The app will need native modules that Expo Go lacks (MapLibre, Expo UI), so it runs in development
builds from the start. `expo-dev-client` adds the launcher and dev menu to debug builds and makes
`npx expo start` serve development builds instead of Expo Go.

### Jest with `jest-expo`, not Vitest

`jest-expo` is Expo's supported preset: it mocks the native side of every Expo module and runs
React Native Testing Library. The Vue tests use Vitest; porting them means `vi.` → `jest.` and
dropping the `vitest` import, which is mechanical.

- **Alternative: Vitest for plain TypeScript, Jest for components.** Rejected: two runners, two
  configs and two mock APIs for one small team.
- Tests live in `test/`, mirroring `src/`, as in the Vue repo. The `@/` alias is mapped in the Jest
  config, because Metro resolves it but Jest does not.

### ESLint with Prettier inside it

Expo's ESLint guide runs Prettier as an ESLint rule (`eslint-plugin-prettier`), so
`npm run lint` checks formatting and `npx expo lint --fix` fixes both. Style: semicolons, single
quotes, trailing commas, width 100 (template and spike style). Ported Vue code (no semicolons) is
reformatted by `--fix`. Lint runs at zero warnings. `no-console` is an error everywhere except the
logger.

### i18n with i18next, initialised before the first render

- `i18next` + `react-i18next` (#346 stack mapping). Resources are bundled JSON and the instance is
  initialised synchronously when `src/core/i18n` is imported by the root layout, so the first frame
  is already in the right language and the launch screen needs no hold.
- **Locale source:** `expo-localization`'s preferred locales, which already put the per-app
  language from system settings first. The Vue `detectLocale` is ported as a pure function over a
  list of language tags. The root layout re-runs it through `useLocales()`, which re-renders when
  Android changes the language without restarting the app (iOS restarts the app itself).
- When the profile port adds a persisted choice, it must win over this sync; the locale store will
  own that rule.
- **Per-app language:** the `expo-localization` config plugin declares `en` and `de`. `de` makes
  the system show "Deutsch" for every German region; detection maps it to `de-CH`.
- **Typed keys:** `CustomTypeOptions.resources` is set to the type of `en.json`, so unknown keys
  fail `tsc`.
- **Catalog conversion** (one-off, from the baseline tag): `{name}` → `{{name}}`; `{'@'}` → `@`; a
  vue-i18n pipe plural with two forms becomes `_one` / `_other`, with three forms `_zero` / `_one` /
  `_other`. This matches vue-i18n's default choice rule (2 forms: 1 → first, else second; 3 forms:
  0 → first, 1 → second, else third), and i18next uses `_zero` only for a count of exactly 0.
  There were 12 pipe plurals and 3 `{'@'}` escapes per locale and no linked messages. The
  converter is not committed: from now on strings change in this repo, and the rare Vue bug fix
  that changes a string is ported by hand. The locale test rejects leftover vue-i18n syntax.
- **Locale checks are a Jest test**, not a separate script, so `npm test` and CI cover them with
  no extra runner: key parity in both directions, the same placeholders per key, no `|`, no
  single-brace placeholders, no `{'…'}` escapes.

### Logger over the console

About twenty lines: `createLogger(tag)` returns `debug`, `info`, `warn`, `error`, prefixed with
`[tag]`; `debug` and `info` are dropped when `__DEV__` is false. It is a plain function, not a
hook, so ported data-layer code can call it at module level. consola was not ported: it targets
Node and browsers, and nothing here needs its reporters.

### Launch without a flash

- `userInterfaceStyle: 'light'` and `backgroundColor: '#ffffff'`, applied on both platforms by
  `expo-system-ui` (Android needs it for the appearance, iOS for the root background). The light
  appearance gives dark status bar content on both platforms, so no status bar component is needed
  yet. The launch screen is the icon on white, the same white as the first screen, and hides as
  soon as the first frame renders: nothing loads asynchronously before it.
- Icons come from the owner's 2048 px winter master `assets/images/winter-original.png` (a
  full-bleed photo, kept unchanged and never bundled because nothing imports it), downscaled, with
  the image generator's corner mark filled in from the surrounding background: `icon.png` 1024 px without alpha,
  the Android adaptive foreground at full bleed (launcher masks keep the goggles), a rounded copy
  for the launch screen (Android 12+ masks it to a circle, which keeps the goggles), and a 48 px favicon. Icon Composer, a themed Android icon and the seasonal
  swap (D14) are follow-ups.

### PR checks in one GitHub Actions job

`npm ci` → `npm run lint` → `npm run typecheck` → `npm test -- --ci` → `npx expo export --platform
web`. One job, because the steps share the install and finish in a few minutes. `typecheck` runs
`expo customize tsconfig.json` first, which generates the typed-route declarations that a fresh
clone lacks. Native build smoke needs a macOS runner or EAS and moves to `add-release-pipeline`.

### Product specs copied verbatim

All 64 specs from the baseline tag are copied unchanged, so the repo has the full parity checklist.
A spec describes the Vue PWA until the change that ports its capability rewrites it; this change
does so for `project-scaffolding` and `i18n`. `openspec/config.yaml` states this for agents.

## Risks / Trade-offs

- [Copied specs read like requirements for this repo but describe the PWA] → `config.yaml`
  context; each port change rewrites its capability.
- [`dev` default means a release build without `APP_VARIANT=prod` ships the dev identity] → The
  EAS production profile sets it; the release pipeline asserts the bundle identifier.
- [Jest with `jest-expo` is slower than Vitest] → Acceptable at this size; revisit if the suite
  passes a few minutes.
- [No native build in CI yet] → The owner's local dev build is the native check until
  `add-release-pipeline`.

## Migration Plan

New repository content only. The owner's checkout still holds the spike's untracked `ios/` folder:
regenerate it with `npx expo prebuild --clean` before the first dev build, then
`npx expo run:ios`. Rollback is reverting the merge.
