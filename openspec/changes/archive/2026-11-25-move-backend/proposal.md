# Proposal

## Why

Since `port-pwa-web` this repository builds every client, but the backend's source of truth (database
schema and migrations, the Cloudflare Worker, the ski-route data job) still lives in
`sekael/tourenbuddy_frontend_vue`, so one feature touches two repositories and the old one cannot be
archived. #374 task 8 moves it here, as planned in `docs/vue-repo-migration.md` part B.

## What Changes

- `supabase/` from the Vue repository's `main` (0.54.0), unchanged: `config.toml`, the 71
  migrations (plus 18 archived pre-baseline ones), `seed.sql`, the pgTAP tests. Not `snippets/` (scratch queries) or `.temp/`. The
  `project_id` stays `tourenbuddy_frontend_vue`, so `supabase start` here reuses the local stack's
  Docker volumes and data. The local stack, `supabase db reset`, `supabase test db` and
  `supabase db push` now run from this repository.
- `services/email-hook/` unchanged: the Worker (auth email hook, notifications, Web Push and native
  push, calendar feed, moderation, account deletion) with its own `package.json`, lock file,
  `wrangler.toml`, tests and Brevo template copies. Same Worker name, so its URL and secrets stay.
  Deploys stay manual (`npx wrangler@latest deploy`).
- `scripts/ski-routes/` and `.github/workflows/ski-route-data.yml` (weekly build to the Pages
  project `tourenbuddy-data`), using this repository's ski difficulty scale; its test runs in Jest.
- Issues move to this repository: `.github/ISSUE_TEMPLATE/` (beta feedback, bug report),
  `.github/workflows/add-to-project.yml`, and the feedback sheet's two links in every client send new
  ones here; the Vue repository's open issues are transferred here once its backend is removed.
- Pull request checks also run the Worker's tests when the Worker changes.
- The app's own tooling (lint, type check, Jest, Metro) leaves `services/`, `supabase/` and
  `scripts/ski-routes/` alone: they keep their own runners and the Vue repository's code style.
- Docs: the backend docs (notifications, moderation, RPC authorization, ski-route data and hosting,
  track routing, distance limits, friendships and visibility, OTP and autofill, realtime and energy)
  into `docs/`; the database rules (migrations are immutable, grants, `security_invoker`, expand
  then contract) into AGENTS.md, replacing "no `supabase/` folder here" (D3); README "Backend" says
  how to run it from here; `docs/vue-repo-migration.md` part B becomes the owner's steps.
- Order: copy here, deploy once from here (link, `migration list` Local = Remote, Worker deploy),
  then delete the backend from the Vue repository in a pull request there. No window has two
  sources.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-scaffolding`: the repository holds the backend (database, Worker, data job) and runs it
  locally from here; pull request checks run the Worker's tests.
- `user-feedback`: the feedback sheet opens the issue forms of `sekael/tourenbuddy-native`.
- `auth`: a password sign-in rule names the backend without the Vue repository.

## Impact

- New top-level folders `supabase/`, `services/email-hook/`; `scripts/ski-routes/`; three workflows
  and two issue templates. No app dependency changes; the Worker's dependencies stay in its own
  lock file.
- `tsconfig.json`, `eslint.config.js`, `metro.config.js`, `src/core/feedback.ts`, AGENTS.md,
  README.md, `docs/`.
- No database, Worker or user-visible behavior changes; the deployed backend stays as it is.
- Owner, on the Mac: copy `supabase/.env` and `services/email-hook/.dev.vars` (local secrets, never
  committed), `supabase stop` in the Vue checkout and `supabase start` here, `supabase link`, one
  Worker deploy, the labels and the secret `ADD_TO_PROJECT_PAT`, then the Vue repository's removal
  pull request and the issue transfer (`docs/vue-repo-migration.md`, B).
