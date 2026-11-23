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

## B. Backend into this repository (later, a change of its own)

Moves the Supabase project and the Worker's source of truth. Order: copy, deploy once from here to
prove it, then delete from the Vue repo, so no window has two sources.

| From the Vue repo | To | Notes |
| --- | --- | --- |
| `supabase/` (`config.toml`, `migrations/`, `seed.sql`, `tests/`) | `supabase/` | `supabase link --project-ref <ref>` from here; `supabase migration list --linked` must show Local = Remote. Skip `supabase/snippets/` (scratch queries) and `.temp/`. Never add `[db.vault]`. Keep `project_id = "tourenbuddy_frontend_vue"`: Docker names the local stack's containers and volumes after it, so `supabase start` here finds your local data; a new id starts a second, empty stack on the same ports |
| `services/email-hook/` | `services/email-hook/` | Its own `package.json`, tests, `wrangler.toml`. Keep the Worker name `tourenbuddy-email-hook` so its URL and secrets stay. Deploy stays manual (`npx wrangler@latest deploy`) |
| `scripts/ski-routes/` + `.github/workflows/ski-route-data.yml` | same paths | Weekly job → Pages project `tourenbuddy-data`; uses the Cloudflare secrets already here |
| `.github/workflows/add-to-project.yml` | same path | Needs secret `ADD_TO_PROJECT_PAT` (a PAT with project write) |
| `.github/ISSUE_TEMPLATE/` (`beta_feedback.yml`, `bug_report.yml`) | same path | The feedback sheet opens them: point the two URLs in `src/core/feedback.ts` at this repository in the same change |
| `scripts/migrate-phones-to-e164.ts` | drop | One-off migration, done |
| `docs/` backend docs: `notifications.md`, `moderation.md`, `supabase-rpc-authorization.md`, `ski-route-data.md`, `ski-route-hosting.md`, `track-routing.md`, `distance-limits.md`, `friendships-and-tour-visibility.md`, `otp-and-email-autofill.md`, `realtime-and-pwa-energy.md` | `docs/` | Plus the Supabase / Database rules in `.claude/conventions.md` → AGENTS.md (migrations immutable, grants, `security_invoker`, expand then contract) |
| `README.md` → local Supabase, auth email modes, seeded users | README "Backend" | Merge with what is there |

Local files on your Mac: copy them as they are, never commit them. They are ignored here only
through the `.gitignore` files of `supabase/` and `services/email-hook/`, so those come first. `services/email-hook/.dev.vars` (the local Worker's secrets for `npx wrangler dev`) and
`supabase/.env` (the values `config.toml` reads with `env(...)`: Brevo SMTP, the email hook secret
and the rest). Not needed: `supabase/.temp` (`supabase link` recreates it), `.branches`,
`.wrangler`, `.certs`.

Nothing to move for these: they live outside both repositories and stay as they are.

- Worker secrets (Cloudflare): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SEND_EMAIL_HOOK_SECRET`,
  `NOTIFY_WEBHOOK_SECRET`, `BREVO_API_KEY`, `BREVO_TEMPLATE_*`, `VAPID_*`, `APNS_*`,
  `FCM_SERVICE_ACCOUNT`, `MODERATION_EMAIL`, `APP_URL`.
- Database Vault secrets `notify_hook_url`, `notify_webhook_secret`; `pg_cron` jobs.
- Brevo templates (the HTML in `services/email-hook/brevo-templates/` is their source copy) and the
  Brevo SMTP relay set in the Supabase dashboard.
- Supabase dashboard auth settings (email OTP, Confirm email, Secure password change, passkeys).

Then in the Vue repo: disable `analyze-and-test.yml` and `test-build-web.yml`, move the open issues
(#346 epic, #374, #386 and the backlog project's items) or leave a pointer, and archive the repository.

### Decisions this needs from you

- AGENTS.md D3 ("no `supabase/` folder here") is replaced.
- The issues: transfer to `tourenbuddy-native` (GitHub keeps redirects) or keep them in the archived
  repo read-only.
