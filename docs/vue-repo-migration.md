# Moving from the Vue repository

What the owner moves by hand from `sekael/tourenbuddy_frontend_vue` into `sekael/tourenbuddy-native`.
The code port (change `port-pwa-web`) moves the web app's code; everything here is a setting, a
secret, a dashboard entry or a backend file that code cannot carry. Values marked "same as" are
copied, never regenerated: GitHub cannot show a secret again, so take each value from its source.

## A. Web app from this repository

### A1. Before the first web preview

| Where | What | Value |
| --- | --- | --- |
| GitHub → tourenbuddy-native → Settings → Secrets and variables → Actions | `SUPABASE_URL` | same as the Vue repo's secret of that name (with `https://`) |
| GitHub secret | `SUPABASE_ANON_KEY` | same as Vue `SUPABASE_ANON_KEY` |
| GitHub secret | `NOTIFY_HOOK_URL` | same as Vue `NOTIFY_HOOK_URL` (Worker URL with `https://`): account deletion, calendar sync and feed |
| GitHub secret | `VAPID_PUBLIC_KEY` | same as Vue `VAPID_PUBLIC_KEY`; must equal the Worker's `VAPID_PUBLIC_KEY` or every existing push subscription breaks |
| GitHub secret | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | already set (public pages); the token needs Pages Edit |
| Supabase → Auth → URL Configuration | Redirect URLs | add `https://*.tourenbuddy-native.pages.dev/**` (previews), as the PWA's previews have `*.touringbuddy.pages.dev` |
| Your machine | Vue `.env.local` | local development only, never a GitHub secret (those hold production values). Each `VITE_X` you use becomes `EXPO_PUBLIC_X` in this repo's `.env.local`: the Supabase pair is there already if you followed README → Backend; add `EXPO_PUBLIC_NOTIFY_HOOK_URL` for the local Worker and `EXPO_PUBLIC_VAPID_PUBLIC_KEY` (it must match the local Worker's key) to try push in a desktop browser |
| Your machine | Vue `.env.phone.local` | nothing to move: it points a phone at the Vite dev server's HTTPS proxy, which Expo has no counterpart for. Try the web app on a phone through the pull request preview; the file retires with the Vue app |

Nothing to do for the Worker's CORS: it already allows `tourenbuddy.ch`, `www`, `test`,
`tourenbuddy-native.pages.dev` and its previews, and `localhost:8081`.

### A2. At the web cutover (#374)

1. **Origin.** Recommended: move the custom domain `test.tourenbuddy.ch` from the Pages project
   `tourenbuddy` to `tourenbuddy-native` (Pages → project → Custom domains). Same origin keeps every
   user's session, settings, installed icon, push subscription and offline regions. A new origin
   loses all of them (users re-install, re-enable push, re-download regions).
2. **Deploy switch and 1.0.0.** GitHub → tourenbuddy-native → Variables: `WEB_DEPLOY` = `true`.
   The cutover pull request sets `"release-as": "1.0.0"` for the package `.` in
   `release-please-config.json` (decided 2026-11-23: the first major version, on the web and in the
   App Store); the release it brings deploys the web app with `public/` as 1.0.0. The next pull
   request removes `release-as` again, or every later release stays 1.0.0.
3. **Stop the Vue deploys** in the same hour, so the two never overwrite each other: disable
   `build-web-and-push.yml`, `release.yml`, `deploy-preview.yml`, `cleanup-preview.yml` in the Vue
   repo (Actions → workflow → Disable).
4. **Supabase → Auth → URL Configuration:** Site URL = the web app's origin; Redirect URLs keep the
   origin(s) it is served on.
5. **Worker `APP_URL`** (`wrangler secret put APP_URL`): the origin notification emails and pushes
   link to (`/?notification=<id>`). Unset means `https://test.tourenbuddy.ch`, which stays right as
   long as the web app lives there.
6. **Passkeys:** nothing. RP `tourenbuddy.ch`, origins already include `test.tourenbuddy.ch`.
7. **Old previews:** delete the `tourenbuddy` Pages project's preview deployments, then the project
   once `test.tourenbuddy.ch` serves from `tourenbuddy-native`.

### A3. What users carry over, and what they don't

On the same origin, the installed PWA sees the new build as an ordinary update ("Eine neue Version
ist verfügbar" → "Neu laden"): the worker keeps its URL `/sw.js`. Checked against a PWA profile:

| Kept | Notes |
| --- | --- |
| Session | `sb-<ref>-auth-token`, same Supabase client default: no new sign-in |
| Settings | locale `tb.locale`, map overlays `tb.map.overlays`, tour list tab, dismissed connect prompts, collision dismissals, guided-tour state (profile) |
| Offline map regions | `offline-regions` database and `offline-map-tiles` cache, same names and keys |
| Push | same `/sw.js` and VAPID key: the browser's subscription keeps working, and the app re-registers its row on start |
| Data | refetched on the first online start, then cached again (IndexedDB `tourenbuddy-tables`) |

Not carried over:

- **Writes queued offline in the PWA** (its outbox in IndexedDB `tourenbuddy-data-cache`): the PWA
  replays them as soon as it is online, and the update only arrives online, after the user taps
  "Neu laden". A write lost needs a device that comes online and updates within the seconds of the
  replay. The old database stays in the browser unused (a few hundred kB at most).
- **The version line** (Profile, footer) shows this repository's version, `0.2.x` in previews
  where the PWA showed `0.54.0`. The cutover release jumps to `1.0.0` (A2, step 2), the iOS app's
  version with it.

Kept as in the PWA (deliberately, polish later): the blocked list, friend requests and contact
actions call a snackbar the PWA never renders, so their confirmations stay invisible; the contacts
sheet opened from the calendar has inert friend-request and friend-tour buttons.

## B. Backend into this repository (change `move-backend`)

Copied unchanged from the Vue repository's `main` (release 0.54.0):

| From the Vue repo | Here |
| --- | --- |
| `supabase/` (`config.toml`, `migrations/` with `_archived/`, `seed.sql`, `tests/`, `.gitignore`) | `supabase/`; `project_id` stays `tourenbuddy_frontend_vue`: Docker names the local stack after it |
| `services/email-hook/` | same path, its own package; Worker name `tourenbuddy-email-hook`, so URL and secrets stay |
| `scripts/ski-routes/build.ts`, `.github/workflows/ski-route-data.yml`, `test/scripts/ski-routes/build.test.ts` | same paths (the test runs in Jest) |
| `.github/workflows/add-to-project.yml`, `.github/ISSUE_TEMPLATE/` | same paths; the feedback sheet's links point here |
| Backend docs (`notifications.md`, `moderation.md`, `supabase-rpc-authorization.md`, `ski-route-data.md`, `ski-route-hosting.md`, `track-routing.md`, `distance-limits.md`, `friendships-and-tour-visibility.md`, `otp-and-email-autofill.md`, `realtime-and-pwa-energy.md`, `manual-tests-preview-on-prod.md`) | `docs/` |
| `.claude/conventions.md` → Supabase / Database, the Worker deploy rule; AGENTS.md → how notifications are delivered | AGENTS.md → "Database and Worker" |
| README → local Supabase, auth email modes, seeded users | README → "Backend" |

Left behind: `supabase/snippets/` (scratch queries) and `scripts/migrate-phones-to-e164.ts` (a one-off
migration, done). New here: `worker.yml` runs the Worker's tests on pull requests that change it.

Nothing to move for these: they live outside both repositories and stay as they are.

- Worker secrets (Cloudflare): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`,
  `NOTIFY_WEBHOOK_SECRET`, `BREVO_API_KEY`, `BREVO_TEMPLATE_*`, `VAPID_*`, `APNS_*`,
  `FCM_SERVICE_ACCOUNT`, `MODERATION_EMAIL`, `APP_URL`.
- Database Vault secrets `notify_hook_url`, `notify_webhook_secret`; `pg_cron` jobs.
- Brevo templates (the HTML in `services/email-hook/brevo-templates/` is their source copy) and the
  Brevo SMTP relay set in the Supabase dashboard.
- Supabase dashboard auth settings (email OTP, Confirm email, Secure password change, passkeys).

### B1. Switch over, once the pull request is merged

On your Mac, from this repository's root:

1. **Local secrets.** Copy them as they are; the `.gitignore` files of `supabase/` and
   `services/email-hook/` keep them out of git. Not needed: `.temp` (`supabase link` recreates it),
   `.branches`, `.wrangler`, `.certs`.

   ```sh
   VUE=../tourenbuddy_frontend_vue   # your Vue checkout
   cp "$VUE/supabase/.env" supabase/.env
   cp "$VUE/services/email-hook/.dev.vars" services/email-hook/.dev.vars
   git status --short --ignored supabase services   # both listed with !!, never with ??
   ```

2. **Local stack.** `supabase stop` in the Vue checkout (without `--no-backup`), then `supabase start`
   here. Same `project_id`, same containers and volumes: your local data, seeded users and auth
   settings are back. `supabase migration list --local` shows every migration applied.
3. **Production link.** `supabase link --project-ref <ref>` (Dashboard → Project Settings →
   General), then `supabase migration list --linked`: Local = Remote on every row, nothing pending.
   Anything else: stop, no `db push`.
4. **Worker.** `cd services/email-hook && npm install && npx wrangler@latest deploy`. Same name and
   code: a no-op for users. `npx wrangler deployments list` shows it on top.
5. **Ski-route data.** Note `curl -s https://tourenbuddy-data.pages.dev/ski-routes.json | jq
   '{version, count}'`, run Actions → Ski-route data → Run workflow with `force`, and check the same
   version and count come back. Then disable the Vue repo's `ski-route-data.yml` (Actions → Disable):
   until then both repositories run it weekly, harmlessly (same data, same Pages project).
6. **Issues.** Copy the labels (the issue forms set `bug` and `user-feedback` only if they exist):
   `gh label clone sekael/tourenbuddy_frontend_vue -R sekael/tourenbuddy-native`. Add the secret
   `ADD_TO_PROJECT_PAT` here (a token with project write; GitHub can't show the Vue repo's, so make a
   new one if you have no copy).

### B2. Remove the backend from the Vue repository

A pull request there, after B1:

- Delete `supabase/`, `services/`, `scripts/ski-routes/`, `scripts/migrate-phones-to-e164.ts`,
  `test/scripts/ski-routes/`, `.github/workflows/ski-route-data.yml`,
  `.github/workflows/add-to-project.yml`, `.github/ISSUE_TEMPLATE/` and the backend docs above.
- README and `.claude/conventions.md` (Supabase / Database), `.claude/env-ci.md` (Worker, ski-route
  data), `.claude/testing.md` (pgTAP, Worker), `AGENTS.md` (database rules, Worker, notifications),
  `.claude/workflow.md` (Database Workflow), `.claude/structure.md` (`supabase/`, `services/`):
  point to `sekael/tourenbuddy-native`.
- Its PWA keeps building and deploying until the cutover (A2): it uses none of these files.

Then move the open issues here; old links redirect, and the backlog project (a user project) keeps
them. The labels from B1 carry over:

```sh
gh issue list -R sekael/tourenbuddy_frontend_vue --state open --limit 500 --json number -q '.[].number' |
  xargs -I{} gh issue transfer {} sekael/tourenbuddy-native -R sekael/tourenbuddy_frontend_vue
```

Rollback: until the removal pull request merges, the Vue repo still has everything; after it,
revert that pull request.

At the cutover (A2), in the Vue repo: disable `analyze-and-test.yml` and `test-build-web.yml`, then
archive the repository.
