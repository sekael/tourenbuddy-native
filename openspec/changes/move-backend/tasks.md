# Tasks

## 1. Copy the backend

- [x] 1.1 Fetch the Vue repository's `main` tarball and check it against the owner's checkout for `supabase/`, `services/`, `scripts/ski-routes/`, `.github/`
- [x] 1.2 Copy `supabase/` (with `migrations/_archived/`, `tests/`, `seed.sql`, `config.toml`, `.gitignore`; without `snippets/`) unchanged
- [x] 1.3 Copy `services/email-hook/` (with its `.gitignore`, lock file, `brevo-templates/`, `templates/`, tests) unchanged
- [x] 1.4 Copy `scripts/ski-routes/` and `.github/workflows/ski-route-data.yml` unchanged; port `test/scripts/ski-routes/build.test.ts` to Jest
- [x] 1.5 Copy `.github/ISSUE_TEMPLATE/` and `.github/workflows/add-to-project.yml`; point `src/core/feedback.ts` at `sekael/tourenbuddy-native` (the forms carry no links)

## 2. App tooling and CI

- [x] 2.1 Exclude `services`, `supabase` and `scripts/ski-routes` from `tsconfig.json` and ESLint, and `services/`, `supabase/` from Metro; `npm run check` passes and lints none of them
- [x] 2.2 `.github/workflows/worker.yml`: the Worker's `npm ci` and `npm test` on pull requests and pushes to `main` that change `services/email-hook/**`
- [x] 2.3 Test that `skiDifficultyGrade` gives the Vue module's grade for every SAC and alpine grade, with and without +/−
- [x] 2.4 Run the Worker's tests from a sandbox copy (never install into the workspace's tree)
- [x] 2.5 Check the migrations against the local database: every file's version is in its migration history, none missing
- [x] 2.6 Run the pgTAP tests against the local database (`supabase/tests`) and the seed users are present

## 3. Docs and rules

- [x] 3.1 Move the backend docs into `docs/` and fix their links to Vue paths
- [x] 3.2 AGENTS.md: a "Database and Worker" section from the Vue conventions (local first, immutable migrations, replay fix, grants, `security_invoker`, definer rules, no `[db.vault]`, expand then contract, manual Worker deploy), replacing "no `supabase/` folder here" (D3) and the stack and structure lines
- [x] 3.3 README "Backend": run the stack, the Worker and the tests from here; the two local secret files to copy
- [x] 3.4 `docs/vue-repo-migration.md` part B: what moved, the owner's remaining steps (Migration Plan 2–3, labels, issue transfer), and the Vue removal pull request's file list; `docs/manual-test-plan.md` and `docs/publishing.md` point here

## 4. Verify

- [x] 4.1 `npm run check`, the web build, and the Worker tests pass; `openspec validate --strict` passes
- [x] 4.2 Diff the copied folders against the Vue `main` tarball once more right before handing over: only the intended link fixes differ

## Workflow follow-up

- Owner (`docs/vue-repo-migration.md`, B1): copy `supabase/.env` and `services/email-hook/.dev.vars` from the Vue checkout; `supabase stop` there and `supabase start` here; `supabase link`; `supabase migration list --linked`; one `npx wrangler@latest deploy`; run the ski-route job once by hand; `gh label clone`; set `ADD_TO_PROJECT_PAT`.
- Owner (B2): the Vue repository's removal pull request; then transfer its open issues here.
- Archive this change after its pull request merges.
