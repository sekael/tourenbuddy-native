# Design

## Context

See proposal.md for why. Facts the approach rests on:

- The Vue repository's `main` (5c72574, release 0.54.0) holds the backend: `supabase/`
  (`config.toml`, `migrations/` with the pre-baseline `_archived/`, `seed.sql`, `tests/`,
  `snippets/`), `services/email-hook/` (own `package.json` and lock, `wrangler.toml`, vitest,
  `brevo-templates/`), `scripts/ski-routes/build.ts` with the weekly `ski-route-data.yml`, plus
  `add-to-project.yml` and `.github/ISSUE_TEMPLATE/`. Its CI tests none of the backend: the Worker's
  tests and `supabase test db` run by hand, and the database and the Worker deploy by hand.
- Both backend folders ship a `.gitignore` for the local secret files (`supabase/.env`,
  `services/email-hook/.dev.vars`) and the CLIs' state (`.temp`, `.branches`, `.wrangler`).
- This repository's `tsconfig.json` includes every `**/*.ts`, ESLint lints everything not ignored
  with Prettier's style (semicolons), and Jest's root is `test/`. The Worker is written in the Vue
  repository's style (no semicolons) with its own `tsconfig.json`.
- `build.ts` imports `skiDifficultyGrade` from `src/features/map/domain/ski-difficulty`, and uses
  nothing else outside Node, so `npx tsx` runs it without `npm ci`. This repository has the same module
  and function, ported.
- The feedback sheet's issue links live in `src/core/feedback.ts`, shared by the native sheet and
  the web port's sheet.
- The local Supabase stack runs on the Mac's Docker; its containers and volumes are named after
  `project_id` (`tourenbuddy_frontend_vue`).

## Goals / Non-Goals

**Goals:**

- Byte-identical backend files, so `db push` and `migration list` see nothing new and the Worker
  deploys the same code.
- `npm run check` and its CI stay exactly as fast and green as before.

**Non-Goals:**

- No change to the schema, the Worker's behavior, its secrets, the Vault secrets, `pg_cron` jobs,
  Brevo templates or the Supabase dashboard settings.
- No automatic deploys of the database or the Worker; no `supabase test db` in CI (it needs the
  Docker stack; it runs locally as before).
- No reformatting of the moved code, no npm workspaces.
- Removing the backend from the Vue repository is its own pull request there, after the deploy from
  here (Migration Plan).

## Decisions

**D1. Copy from the Vue repository's `main` tarball, unchanged.** The source is
`gh api repos/sekael/tourenbuddy_frontend_vue/tarball/main`, identical to the owner's checkout for
every backend folder (checked). Left out: `supabase/snippets/` (scratch queries),
`scripts/migrate-phones-to-e164.ts` (a one-off migration, done) and anything ignored.
Alternative, `git subtree` with history: the history stays readable in the archived repository, and
a subtree merge drags the whole Vue history into this one.

**D2. Keep `project_id = "tourenbuddy_frontend_vue"` and `config.toml` as it is.** A new id would
start a second, empty stack on the same ports. `site_url` and the redirect URLs keep the PWA's dev
origin: the apps sign in by email code, which needs no redirect.

**D3. The Worker stays its own package in `services/email-hook/`.** Its dependencies (`wrangler`
with platform binaries, `vitest`, `@cloudflare/workers-types`) stay out of the app's lock file and
`node_modules`, which the Mac's native builds use. It is tested with `npm ci && npm test` in its
folder.

**D4. The app's tooling skips the backend.** `tsconfig.json` excludes `services`, `supabase` and
`scripts/ski-routes`; ESLint's global ignores take the same paths. Metro's block list takes
`services/` and `supabase/` (anchored at the project root): `wrangler dev` and the Supabase CLI write
their state there, and a watched write refreshes the app. The ski build's own test
(`test/scripts/ski-routes/build.test.ts`) moves to Jest, which type-checks `build.ts` through it. Alternative, adopt them into the
app's lint and types: hundreds of formatting changes to code being moved, and `build.ts` would need
Node types the app's type check doesn't load.

**D5. Worker tests in CI, only when the Worker changes.** A workflow `worker.yml` runs on pull
requests and pushes to `main` that touch `services/email-hook/**`: `npm ci` and `npm test` in that
folder, with its own lock file cached. A separate workflow, not a job in `checks.yml`: a path
filter on the workflow keeps every other pull request's checks as they are.

**D6. The ski-route job runs here unchanged.** It already reads the Cloudflare secrets this
repository has for previews (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) and deploys to the
same Pages project, with its own pinned Node version and tools (GDAL, tippecanoe). A test pins
`skiDifficultyGrade` for every grade the Vue module knew, so the dataset's grades can't drift.

**D7. Issues come here.** The two issue forms, `add-to-project.yml` (secret `ADD_TO_PROJECT_PAT`)
and both feedback links point at `sekael/tourenbuddy-native`; the forms' labels (`bug`,
`user-feedback`) are cloned from the Vue repository first, or the forms can't set them. The open
issues are transferred here (owner decision) after the Vue removal pull request: GitHub redirects
the old links and keeps them on the user-owned backlog project, so this repository's bare `#n`
references, which name Vue issues, keep resolving. No renumbering sweep.

**D8. Docs and rules.** The backend docs move into `docs/` as they are (their links to Vue paths
fixed). The Vue conventions' "Supabase / Database" section becomes an AGENTS.md section,
replacing D3's "no `supabase/` folder here". README "Backend" runs the stack from here.
`docs/vue-repo-migration.md` part B turns into the owner's remaining steps.

## Risks / Trade-offs

- [Two stacks on one Docker: `supabase start` here while the Vue checkout's stack runs] → Stop it
  in the Vue checkout first (`supabase stop`, no `--no-backup`); same `project_id`, same volumes.
- [A backend change lands in the Vue repository between the copy and its removal] → The copy is
  checked against the Vue `main` again right before the pull request; the Vue removal pull request
  follows the first deploy from here.
- [Missing local secrets break `supabase start` (`env(...)` values) or `wrangler dev`] → The owner
  copies `supabase/.env` and `services/email-hook/.dev.vars` from the Vue checkout; the README says
  so.
- [`supabase link` from here points at a different project] → Check `migration list --linked`
  shows Local = Remote before any `db push`.
- [The ski-route job's first run here builds a different dataset] → It runs on demand
  (`workflow_dispatch`) once and the output is compared with the live `manifest.json` before the
  Vue job is removed.

## Migration Plan

1. This change's pull request (copy, tooling, CI, docs, feedback links). Merging changes nothing
   deployed.
2. Owner, on the Mac: copy the two local secret files; `supabase stop` in the Vue checkout,
   `supabase start` here; `supabase link --project-ref <ref>`; `supabase migration list --linked`
   (Local = Remote); `npx wrangler@latest deploy` in `services/email-hook/` (same code, a no-op for
   users); run the ski-route job once by hand; set `ADD_TO_PROJECT_PAT`.
3. A pull request in the Vue repository deletes the backend (`supabase/`, `services/`, the ski-route
   script with its test and workflow, `add-to-project.yml`, the issue forms, the backend docs; full
   list in `docs/vue-repo-migration.md`, B2) and points its README and rules here. Its
   PWA keeps building until the cutover (#374). Then its open issues are transferred here
   (`docs/vue-repo-migration.md`, B2).

Rollback: until step 3, the Vue repository still has everything; after it, revert that pull
request.

## Open Questions

None: the open issues are transferred (D7).
