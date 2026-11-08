# Environment & CI/CD

## CI

- **PR checks** (`analyze-and-test.yml`): lint → locale parity → type-check → test type-check (non-blocking) → vitest. Database pgTAP suites and the Worker's tests are NOT run in CI — run them locally (see `testing.md`).
- **PR build smoke** (`test-build-web.yml`): build only, no deploy
- **PR preview deploy** (`deploy-preview.yml`): build + deploy to `https://<branch-slug>.touringbuddy.pages.dev` on every PR to `main` (Pages project `tourenbuddy`, subdomain `touringbuddy`). Posts/updates sticky comment with preview URL. Skipped for forked PRs. Branch slug is lowercased, sanitized to `[a-z0-9-]`, capped at 28 chars.
- **PR preview cleanup** (`cleanup-preview.yml`): on PR close (merged or not), deletes all preview deployments associated with the branch slug via the Cloudflare API, keeping the Pages deployments list tidy.
- **Release** (`release.yml`): release-please auto-versions on merge to `main`
- **Deploy** (`build-web-and-push.yml`): build → Cloudflare Pages `main` branch (triggered by release-please)
- CI creates dummy `.env` — real env never committed

> Cloudflare Pages dashboard env vars are **not** read by this pipeline — the build step in GitHub Actions writes `.env` from repo secrets, then uploads the prebuilt `dist/`. Add new `VITE_*` vars to BOTH the workflow `Create Env File` step AND the GitHub Actions repo secrets.

## Environment Variables

All client vars need `VITE_` prefix. Validated at startup via Zod in `core/constants/env.ts`:

**Required:**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous (publishable) key

**Optional:**
- `VITE_VAPID_PUBLIC_KEY` — Web Push VAPID public key, used to subscribe this browser. MUST match the Worker's `VAPID_PUBLIC_KEY` secret. Unset → push can't be enabled (logged).
- `VITE_NOTIFY_HOOK_URL` — `services/email-hook` Worker URL (e.g. `https://tourenbuddy-email-hook.<account>.workers.dev`). Used for the on-demand calendar sync (`/calendar/sync`) and the outbound tour feed URL (`/calendar/<token>.ics`). Notification dispatch does NOT use it — the database calls the Worker (Vault `notify_hook_url`).
- `VITE_BUILD_COMMIT` — PR previews only: commit shown next to the app version.

Access via `env` object from `core/constants/env.ts`, never `import.meta.env` directly in feature code.

## GitHub Actions secrets

Set at **repo → Settings → Secrets and variables → Actions**:

- `SUPABASE_URL` — Supabase project URL **including `https://` scheme** (validated client-side via `z.string().url()`)
- `SUPABASE_ANON_KEY` — Supabase anon/publishable key
- `VAPID_PUBLIC_KEY` — VAPID publicKey (frontend; same value as Worker secret)
- `NOTIFY_HOOK_URL` — Worker URL **including `https://` scheme** (e.g. `https://tourenbuddy-email-hook.<account>.workers.dev`). Validated client-side via `z.string().url()`; bare hostnames fail validation and crash the app on boot.
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — for `wrangler pages deploy`

> URL-typed secrets MUST include the protocol. `tourenbuddy-email-hook.workers.dev` ❌ → `https://tourenbuddy-email-hook.workers.dev` ✅

## Ski-route data (`tourenbuddy-data` Pages project)

Weekly scheduled job `.github/workflows/ski-route-data.yml` rebuilds the self-hosted ski-route tiles + route files from Swisstopo and deploys them to `https://tourenbuddy-data.pages.dev`, independent of app releases. Failures, `force`, keepalive: `docs/ski-route-data.md`.

## Worker (`services/email-hook`)

Separate deploy via `wrangler deploy` (manual). Worker secrets use **plain names, no `VITE_` prefix** (Workers env model — Vite prefix has no meaning server-side). See `services/email-hook/SETUP-NOTIFICATIONS.md` for the full list and `wrangler secret put` flow.

> **IMPORTANT — Worker deploy is NOT in CI.** Any change to `services/email-hook/` (handler logic, new endpoints, dependencies, `wrangler.toml`, secrets) requires a manual `cd services/email-hook && npx wrangler deploy`. CI only ships the frontend. Without this step, Preview / prod call a stale Worker version and fail in non-obvious ways (e.g. notifications returning 401 because the deployed Worker still points at a stale `SUPABASE_URL`). Plans and OpenSpec change task lists that touch the Worker MUST include this deploy step. Always use the **latest wrangler** (`npx wrangler@latest` if in doubt) — outdated wrangler has shipped silently-broken deploys.
