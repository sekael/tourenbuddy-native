# Code Conventions

## General

- Keep code concise, better solutions use as much as needed, as little as possible code to implement feature 
- `<script setup lang="ts">` for all components
- `defineProps<{ title: string }>()` type-only syntax
- File names: `kebab-case.vue` / `kebab-case.ts`. Types: `PascalCase`
- One component per file, max ~150 lines — extract sub-components
- No `console.log()` — use logger composable
- Handle errors with store state (`loading`, `error`, `data` refs)
- `computed()` for derived state, `watch()` / `watchEffect()` for side effects
- ALWAYS run `npx eslint . --fix` after changes — NEVER use `npm run format`
- NEVER change or format CHANGELOG, this is handled by release-please

## Pinia

- Composition API stores only: `defineStore('name', () => { ... })`
- `ref()` for state, `computed()` for getters, plain functions for actions
- `storeToRefs()` in components for reactive destructuring
- Stores in `features/<name>/presentation/stores/`
- Mock via `createTestingPinia()` in tests

## Routing

- Manual route definitions in `src/app/router/index.ts`
- Auth redirect in `beforeEach` guard, reactive to auth store
- Dialogs/sheets presented imperatively, not as routes

## Styling

- CSS custom properties: slate primary, blue accent
- Design tokens: spacing (xxs–xxl), radius (sm/md/lg), shadows (sm/md/lg)
- Scoped styles by default
- Prefer native CSS (nesting, `:has()`, container queries) over preprocessors

### Fonts & icons (self-hosted, NO CDN)

IMPORTANT: The app ships **all** fonts and icons in its own bundle. There is **no Google Fonts CDN** and no icon font — this is deliberate (fixes a FOUT layout bug, removes the client-IP leak to Google, and works offline). Do NOT reintroduce a `fonts.googleapis.com` / `fonts.gstatic.com` `<link>`.

- **Fonts:** Inter, self-hosted via `@fontsource/inter`, weights **400/500/600**, imported in `src/main.ts`. `--font-family-base` = `'Inter', <system stack>`. The woff2 files are precached by the existing `injectManifest` `woff2` glob in `vite.config.ts`.
- **Icons:** bundled, tree-shaken **SVGs** via `unplugin-icons` + Iconify `@iconify-json/material-symbols` (Outlined variant, weight 400). Rendered through the shared `<BaseIcon name="…">` component (`src/core/components/base-icon.vue`), which resolves the name through a **central registry** (`src/core/components/icons.ts`). The registry is required because icon names are chosen at runtime (`:name` bindings, `TOUR_TYPE_ICONS`) and `unplugin-icons` only resolves `~icons/…` imports statically at build time.

**To add a new icon:** add one import + one entry to `src/core/components/icons.ts`, mapping the internal underscore name to `~icons/material-symbols/<kebab-name>` (append `-outline` for the unfilled variant to match the design; glyph-only icons like `add`/`close` ship a single variant). Then use `<BaseIcon name="internal_name" />`. A name not in the registry renders nothing — never rely on an unregistered name.

**When Material has no fitting glyph** (e.g. `ski_touring`, `splitboarding`): add a 24×24 `viewBox` SVG with `fill`/`stroke="currentColor"` to `src/assets/icons/<kebab-name>.svg`, built from Material shapes so weight and style match, and register it from `~icons/tb/<kebab-name>` like any other icon. The `tb` collection is declared in both `vite.config.ts` and `vitest.config.ts` — keep them in sync.

**To add a new font weight:** `npm i @fontsource/inter` already provides all static weights — import `@fontsource/inter/<weight>.css` in `src/main.ts` and confirm the emitted woff2 is covered by the `injectManifest` `woff2` glob so it precaches.

## Supabase / Database

- IMPORTANT: ALL database changes (schema, RLS, functions, triggers, storage policies, buckets, extensions) MUST be applied to the LOCAL Supabase database FIRST — never edit productive DB directly
- Workflow:
  1. `supabase start` (local stack must be running)
  2. Create migration: `supabase migration new <descriptive_name>` → edit generated file under `supabase/migrations/`
  3. Apply locally: `supabase db reset` (re-runs all migrations from clean state) or `supabase migration up`
  4. Verify locally (test feature against local DB), run `npm run test`
  5. Push to prod ONLY after review: `supabase db push` (prompt user — never run unprompted)
- CRITICAL: NEVER edit any existing file under `supabase/migrations/` — migration history is immutable, fix forward only. This includes the baseline `20260101000000_initial_schema.sql`. Every DB change (schema, defaults, RLS, functions, triggers, storage, extensions) MUST go in a NEW migration file created via `supabase migration new <name>`. Sole exception: replay fix (below).
- Migration files: `supabase/migrations/<timestamp>_<name>.sql`
- Replay-fix exception: if an existing migration no longer replays on a fresh DB (`supabase db reset`, preview branch, new machine) — typically after an upstream Supabase image change — edit it in place, but ONLY if the edited file produces the same end state on a fresh DB as the original produced on prod. A new migration cannot fix this: the replay aborts before reaching it.
  - Why prod is safe: `supabase db push` matches migrations by version (timestamp) only, never by content, so an already-applied version is never re-run.
  - Verify: `supabase db reset` passes locally, and `supabase migration list --linked` shows Local = Remote with nothing pending.
  - Add a comment in the edited file explaining the change. Precedent: `20260608062430_friend_tours_realtime_messages_policy.sql` (dropped a no-op `alter table realtime.messages`).
- NEVER `ALTER TABLE` Supabase-owned tables (`realtime.*`, `auth.*`, `storage.*`) — owned by internal roles, `postgres` is not owner. Policy statements (`create/alter/drop policy`) are allowed. RLS is already enabled on `realtime.messages` and `storage.objects`.
- NEVER hand-edit prod schema via Supabase Studio/SQL editor — drifts from repo
- NEVER add a `[db.vault]` block to `supabase/config.toml`: `db push` upserts it into prod Vault, overwriting prod's secrets with local ones. Vault secrets are set by hand per database (`services/email-hook/SETUP-NOTIFICATIONS.md`)
- `supabase/migrations/_archived/` contains pre-baseline patches — do not run, kept for history only
- Baseline migration `20260101000000_initial_schema.sql` reflects prod schema at cutover; subsequent changes go in new timestamped files
- App must run against local Supabase during development — point `VITE_SUPABASE_URL` to local stack URL (`http://127.0.0.1:54321`) in `.env.local`
- IMPORTANT: Every migration that runs `CREATE TABLE` in the `public` schema MUST include explicit Data API grants in the same file. Supabase removes the implicit default on 2026-10-30 (existing projects, new tables only) — tables without grants are invisible to PostgREST / supabase-js / GraphQL. Template:
  ```sql
  create table public.<name> ( ... );
  grant all on table public.<name> to anon, authenticated, service_role;
  ```
  RLS still governs row access — these grants only restore Data API exposure. See https://github.com/orgs/supabase/discussions/45329.
- IMPORTANT: Functions are NOT executable by clients unless granted (default privileges revoked in `20261012144059_security_hardening.sql`). In the migration that creates a function: `grant execute on function public.<fn>(<args>) to authenticated;` (`service_role` keeps EXECUTE by default). Internal helpers called only from other SECURITY DEFINER functions or triggers get NO client grant — a definer helper that takes a user id / tour id without re-checking `auth.uid()` must never be reachable over PostgREST.
- Every SECURITY DEFINER function MUST `set search_path`; every client-callable one MUST also authorize the caller itself (`auth.uid()`), because it bypasses RLS.
- Views MUST be `with (security_invoker = true)` and granted `select` only (`revoke all ... from anon, authenticated; grant select ... to authenticated`). A default (definer) view runs as `postgres`, bypasses RLS, and a simple one is auto-updatable — `tours_view` was readable, updatable and deletable with the anon key until 2026-10-12.
- Storage read grants that match an object by a path stored in a row MUST also pin the object's owner prefix (`split_part(name, '/', 1) = <owner>::text`).
- Background for all of the above (gates, roles, definer semantics, search_path, worked example): `docs/supabase-rpc-authorization.md`.

## Internationalization

- User-facing text MUST be added as parameterized text supporting `vue-i18n` library
- Check for existing key-value pairs for text in locales JSON files
- Only if none exist, add new key and value for EVERY locale, i.e. `en.json`, `de-CH.json`
- Inject values following pattern `const { t, locale } = useI18n({ useScope: 'global' })` and `t('tours.infoSheet.completedBtn')`
