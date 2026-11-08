# TourenBuddy Frontend (Vue)

A tour-planning app for outdoor enthusiasts.
Pin tour objectives on the map, remember the friends you want to do it with, contact them, set dates, and finally complete your adventures.
TourenBuddy aims to be your one tool to keep track of objectives and touring partners outdoors.

## Disclaimer

Most of the code in this repository has been generated with Claude Code using specification-driven development based on the `openspec` framework.
You may view the configuration and settings used for code generation anytime under [AGENTS.md](./AGENTS.md) (imported by [CLAUDE.md](./CLAUDE.md)) and [.claude](./.claude/).
The current version of the specification used in development is always available at [openspec](./openspec/specs/).

## Prerequisites

- **Node.js** 20 or later, **npm** 10 or later
- **Docker Desktop** running (for local Supabase stack)
- **Supabase CLI** — install via [supabase.com/docs/guides/local-development/cli/getting-started](https://supabase.com/docs/guides/local-development/cli/getting-started)
- (Optional) Brevo + Twilio Verify accounts for real email/SMS delivery; otherwise local stack uses Inbucket/Mailpit for email and `[auth.sms.test_otp]` (fixed code `123456`, placeholder Twilio creds) for phone verification of seeded test users

## Setup

Local-first development is the default — frontend talks to a Supabase stack running on your machine, never to production. Production credentials are only needed when explicitly testing prod behavior.

### 1. Clone and install

```bash
git clone <repo-url>
cd tourenbuddy_frontend_vue
npm install
```

### 2. Start local Supabase stack

```bash
supabase start
```

First run pulls images (~5 min). Stack URLs once running:

| Service          | URL                      |
| ---------------- | ------------------------ |
| API              | `http://127.0.0.1:54321` |
| Studio (DB UI)   | `http://127.0.0.1:54323` |
| Inbucket/Mailpit | `http://127.0.0.1:54324` |

Get the local anon key: `supabase status` → copy `anon key`.

Apply migrations from clean state at any time:

```bash
supabase db reset
```

### 3. Configure frontend env

Create `.env.local` (gitignored, overrides `.env`):

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<anon key from supabase status>
```

### 4. Run frontend

```bash
npm run dev
```

App at `http://localhost:5173`, talking to local Supabase.

**Stop stack:** `supabase stop`. **View logs:** `supabase logs <service>` (e.g. `auth`).

### 5. Test on your phone (same network)

`npm run dev -- --host` alone is not enough:

- The phone opens `http://<LAN-IP>:5173`, which browsers do not treat as a secure context, so `crypto.randomUUID` is missing (saving a tour or contact fails) and the service worker never registers.
- `127.0.0.1:54321` from `.env.local` points at the phone itself, not at your Mac's Supabase.

`npm run dev:phone` fixes both. It serves the app over HTTPS on your LAN IP, and the dev server forwards `/rest`, `/auth`, `/storage` and `/realtime` to the local Supabase stack, so the phone only needs one address it trusts.

**One-time setup** (macOS; on other systems install [mkcert](https://github.com/FiloSottile/mkcert) your way):

1. Install mkcert and create its local certificate authority (the Mac trusts it automatically):

   ```bash
   brew install mkcert
   mkcert -install
   ```

2. Find your Mac's LAN IP (Wi-Fi): `ipconfig getifaddr en0`.
3. Create the dev server certificate for that IP (`.certs/` is gitignored):

   ```bash
   mkdir -p .certs
   mkcert -cert-file .certs/cert.pem -key-file .certs/key.pem <LAN-IP> localhost
   ```

4. Make the phone trust the mkcert authority. The file is `rootCA.pem` in the folder printed by `mkcert -CAROOT`.
   - **iPhone:** AirDrop `rootCA.pem` to the phone, then Settings → _Profile Downloaded_ → Install. Afterwards turn on full trust under Settings → General → About → Certificate Trust Settings.
   - **Android:** copy `rootCA.pem` to the phone, then Settings → Security → Encryption & credentials → Install a certificate → CA certificate (menu names vary by vendor). Chrome trusts user-installed authorities.

   > **Keep `rootCA-key.pem` private.** It sits in the same folder, and anyone holding it can issue certificates your phone trusts for any website. Never copy it to the phone or anywhere else, and remove the profile/certificate from the phone when you no longer need it.

5. Create `.env.phone.local` (gitignored). It is layered over `.env.local`, which still supplies the anon key:

   ```env
   VITE_SUPABASE_URL=https://<LAN-IP>:5173
   ```

**Each time:**

```bash
supabase start      # if not already running
npm run dev:phone
```

Open the **Network** URL Vite prints (`https://<LAN-IP>:5173`) on the phone. It should load without a certificate warning; a warning means step 4 is missing. Sign in as usual; the OTP email lands in Mailpit on your Mac (`http://127.0.0.1:54324`).

**Troubleshooting:**

- `ENOENT … .certs/cert.pem`: you skipped step 3.
- The page does not load: the phone and the Mac must be on the same network (guest Wi-Fi often isolates devices). Also allow incoming connections for `node` if macOS asks.
- Your LAN IP changed (new network, new DHCP lease): redo step 3 and update `.env.phone.local`.

Only port 5173 must be reachable from the phone; Supabase keeps listening on your Mac as before.

---

## Auth email & SMS — local delivery modes

The local stack supports three email modes; SMS delivery is opt-in. Pick what matches the test.

### Email mode A — Inbucket (default, no secrets needed)

Committed `supabase/config.toml` ships with both `[auth.email.smtp]` and `[auth.hook.send_email]` set to `enabled = false`, so all auth emails (OTP / magic link) are captured by Inbucket at `http://127.0.0.1:54324`. Fast, free, ideal for routine dev and the **default flow for seeded test users** (see _Local test users (seeded)_ below).

### Email mode B — Cloudflare worker + Brevo templates (matches production)

Production uses the Cloudflare worker in `services/email-hook/` as Supabase's [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook). The worker picks a Brevo transactional template per user locale (EN/DE) and submits via the Brevo API. `supabase/config.toml` already points the hook at `http://host.docker.internal:8787/` but ships it with `enabled = false` — set `enabled = true` under `[auth.hook.send_email]` for this mode (do not commit the flip).

1. Generate a shared HMAC secret (Standard Webhooks format expected by Supabase):

   ```bash
   echo "v1,whsec_$(openssl rand -base64 48 | tr -d '\n')"
   ```

   Paste the same value into both files:
   - `supabase/.env` → `SEND_EMAIL_HOOK_SECRET=`
   - `services/email-hook/.dev.vars` → `SEND_EMAIL_HOOK_SECRET=`

2. Fill remaining values in `services/email-hook/.dev.vars` (copy `.dev.vars.example`). The OTP path needs only:

   ```env
   BREVO_API_KEY=<Brevo "API Keys" tab key — NOT an SMTP key>
   BREVO_TEMPLATE_EN=<numeric ID of otp_en transactional template>
   BREVO_TEMPLATE_DE=<numeric ID of otp_de transactional template>
   ```

   Notification and calendar values are listed in [SETUP-NOTIFICATIONS.md](./services/email-hook/SETUP-NOTIFICATIONS.md).

3. Start the worker (separate terminal, port 8787):

   ```bash
   cd services/email-hook
   npm install
   npx wrangler dev
   ```

4. Restart Supabase so it re-reads `config.toml` + `supabase/.env`:

   ```bash
   supabase stop && supabase start
   ```

5. Sign up with a real email — verify:
   - `wrangler dev` terminal logs `POST / 200`
   - `supabase logs auth` shows `send email hook` invocation
   - Email arrives via Brevo with the per-locale template

### Email mode C — Brevo SMTP relay (rarely needed)

`[auth.email.smtp]` block in `config.toml` points at Brevo SMTP. Used only when the Send Email Hook is disabled. Set in `supabase/.env`:

- `BREVO_SMTP_LOGIN`: address shown under **SMTP & API → SMTP tab → Login** (your Brevo account email)
- `BREVO_SMTP_API_KEY`: generate under **SMTP & API → SMTP Keys → Generate a new SMTP key** (NOT an "API Keys" tab key)
- `BREVO_SENDER_EMAIL`: verified sender (Senders → add and verify)

Restart stack to apply.

### SMS — committed defaults

Two providers are configured in `supabase/config.toml`:

- `[auth.sms.twilio]` — **enabled** with **placeholder creds** (`account_sid = "ACtest"` etc.). Required by GoTrue so `[auth.sms.test_otp]` can short-circuit OTP delivery for the three seeded test phone numbers (fixed code `123456`). No real SMS is sent for matched numbers; non-test phones would error. Set `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=test` in your shell or `supabase/.env` before `supabase start`.
- `[auth.sms.twilio_verify]` — `enabled = false`. The production phone-verification path. Opt in only when explicitly testing real Twilio — every send burns real quota.

To enable real Twilio Verify locally:

1. Set `enabled = true` under `[auth.sms.twilio_verify]`, and `enabled = false` under `[auth.sms.twilio]` (only one provider can be active). Do not commit this change unless team agrees.
2. Add to `supabase/.env`:

   ```env
   TWILIO_ACCOUNT_SID=<Console → Account Info>
   TWILIO_VERIFY_SERVICE_SID=<Console → Verify → Services, starts with VA>
   SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=<Auth Token; variable name fixed by Supabase CLI>
   ```

3. Verify service must be configured for the recipient country (e.g. `+41` for Switzerland).
4. `supabase stop && supabase start`.

### Switching modes

Toggle blocks in `supabase/config.toml`:

```toml
[auth.hook.send_email]
enabled = true # mode B; false → falls back to mode A or C

[auth.email.smtp]
enabled = true # mode C; ignored when hook is enabled

[auth.sms.twilio_verify]
enabled = false # default locally; flip to true to send real SMS via Twilio Verify
```

`supabase stop && supabase start` after every config change. `supabase db reset` does NOT reload config.

### Caveats

- `supabase db reset` wipes `auth.users` but `supabase/seed.sql` re-creates the five seeded test users (Patrick / Jakob / Reni / Selim / Anna) automatically. Real signups still need to be re-done after a reset and burn Brevo quota in mode B and Twilio quota when SMS Verify is enabled.
- If the Send Email Hook is enabled but `wrangler dev` is not running, signup will fail with hook timeout.
- Brevo has two distinct credential types: **SMTP keys** (mode C) vs **API keys** (mode B). They are not interchangeable.
- Twilio Verify expects a **Verify Service SID** (`VAxxx`), not a Messaging Service SID — using the wrong one yields error 21212.
- Phone verification will fail locally with SMS disabled (default). Enable only for explicit testing.

---

## Local test users (seeded)

`supabase/seed.sql` runs automatically on every `supabase db reset` (never pushed to prod) and seeds five phone-verified test users with a friendship graph, contacts and tours so friend/tour features can be exercised end-to-end:

| Name    | Email                    | Phone          | Relations                                                      |
| ------- | ------------------------ | -------------- | -------------------------------------------------------------- |
| Patrick | `patrick@tourenbuddy.ch` | `+41790000001` | friends with Jakob and Selim; pending request from Reni        |
| Jakob   | `jakob@tourenbuddy.ch`   | `+41790000002` | friends with Patrick; partner on Patrick's tour "Gfroren Hora" |
| Reni    | `reni@tourenbuddy.ch`    | `+41790000003` | pending requests to Patrick and Selim                          |
| Selim   | `selim@tourenbuddy.ch`   | `+41790000004` | no profile name; friends with Patrick; pending request to Anna |
| Anna    | `anna@tourenbuddy.ch`    | `+41790000005` | pending request from Selim                                     |

Tours: Patrick's "Büelehora" (no partners — friends see it gated) and "Gfroren Hora" (partner Jakob), and Jakob's "Piz Ela" (partner Patrick — use it to try tour suggestions).

Re-running `supabase db reset` is idempotent — every insert uses `ON CONFLICT DO NOTHING` on fixed UUIDs.

### Login — Email OTP via Inbucket (recommended)

The app's only login path is email OTP. The Supabase CLI does **not** support `[auth.email.test_otp]`, so email codes are dynamic — every login generates a fresh code. With the committed default (mode A — both `[auth.email.smtp]` and `[auth.hook.send_email]` disabled), all auth emails land in Inbucket at `http://127.0.0.1:54324`, no extra config needed.

Login flow:

1. In the app, request an email OTP for e.g. `jakob@tourenbuddy.ch`.
2. Open Inbucket at `http://127.0.0.1:54324`.
3. Open the inbox for the test address; copy the 6-digit code from the email body.
4. Paste into the app's OTP field.

Switch to mode B/C only when explicitly testing the production-equivalent email path (see _Auth email & SMS — local delivery modes_ above).

### Phone verification — fixed SMS OTP (no app login)

The app verifies a user's phone number separately from login (phone verification gates friend features). Seeded users already have `phone_confirmed_at` set, so no in-app verification is needed for them. If you need to re-trigger the phone-verification flow against a seeded user, `supabase/config.toml` defines `[auth.sms.test_otp]` mapping the first three phone numbers to the fixed code **`123456`**, and Twilio is enabled with placeholder credentials (required by GoTrue for `test_otp` to short-circuit — no real SMS is sent):

```toml
[auth.sms.twilio]
enabled = true
account_sid = "ACtest"
message_service_sid = "MGtest"
auth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"

[auth.sms.test_otp]
"41790000001" = "123456"
"41790000002" = "123456"
"41790000003" = "123456"
```

Export the dummy auth token before starting the stack so GoTrue accepts the placeholder Twilio config (any non-empty value works):

```bash
export SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=test
supabase start
```

## Database changes

All schema/RLS/storage changes go through migrations — never edit prod directly. See [.claude/conventions.md](./.claude/conventions.md#supabase--database).

```bash
supabase migration new <descriptive_name>     # create file
# edit supabase/migrations/<timestamp>_<name>.sql
supabase db reset                              # apply locally from scratch
npm run test                                   # verify
supabase db push                               # deploy to prod (after review, prompt user)
```

Baseline `supabase/migrations/20260101000000_initial_schema.sql` reflects prod schema at cutover. Pre-baseline patches archived under `supabase/migrations/_archived/` — reference only, do not run.

## Available Commands

| Command                   | Description                                          |
| ------------------------- | ---------------------------------------------------- |
| `npm run dev`             | Start dev server with hot reload                     |
| `npm run build`           | Type-check and build for production                  |
| `npm run preview`         | Preview the production build locally                 |
| `npm run test`            | Run unit tests (single pass)                         |
| `npm run test:watch`      | Run unit tests in watch mode                         |
| `npm run type-check`      | Check TypeScript types without building              |
| `npm run type-check:test` | Type-check `test/` + `scripts/` (non-blocking in CI) |
| `npm run lint`            | Lint all source files (zero warnings enforced)       |
| `npm run check:locales`   | Fail if `de-CH.json` misses keys from `en.json`      |

Formatting is enforced by ESLint (`npx eslint --fix <paths>`); do not run `npm run format`. Database RLS tests live in `supabase/tests/` (pgTAP, run with `supabase test db` after `supabase db reset`); the Worker has its own suite (`cd services/email-hook && npm test`).

## Tech Stack

Frontend:

- **Vue 3** with TypeScript and `<script setup>` SFCs
- **Vite** — build tool and dev server
- **Pinia** — state management (composition API stores)
- **Vue Router 4** — client-side routing with auth guards
- **Supabase** — backend (PostgreSQL + Auth via email/OTP + Realtime + Storage)
- **MapLibre GL JS** — map rendering
- **Swisstopo** — Swiss topographic vector tiles (free, no API key required)
- **vue-i18n** — English and Swiss German
- **PWA** (`vite-plugin-pwa`, custom service worker) — installable, offline app shell, offline base map, IndexedDB data cache with an offline write queue, Web Push
- **Zod** — runtime validation and type inference
- **Vitest** + happy-dom — unit testing

Backend:

- Supabase PostgreSQL (PostGIS) with auto-generated REST + Auth (email OTP); all writes that need more than RLS go through SECURITY DEFINER RPCs
- Notification events recorded in the database (`public.notifications`, the in-app inbox) and handed to the Worker after commit via `pg_net`; `pg_cron` runs retention, weekly availability summaries and tour reminders
- Supabase Storage: `tour-gpx` (GPX tracks) and `tour-attachments` (images/PDFs), both private and owner-prefixed
- Cloudflare worker (`services/email-hook/`) — Supabase Send Email Hook → Brevo OTP templates; push/email delivery for notification events; calendar feed sync (cron + on demand) and the outbound `.ics` tour feed

Infrastructure:

- Cloudflare Pages deployment for frontend (production deploy on release, preview deploy per PR)
- Cloudflare Workers for the email hook (`wrangler deploy`, manual)
- GitHub Actions for CI/CD
- Brevo for transactional email (auth + notifications)
- Twilio Verify for phone-number verification

### Preview deployments

Every PR to `main` triggers `.github/workflows/deploy-preview.yml`, which builds the frontend with production secrets and deploys to `https://<branch-slug>.touringbuddy.pages.dev` (the Pages project is named `tourenbuddy`, its subdomain is `touringbuddy`). The workflow posts a sticky comment on the PR with the preview URL. Preview builds use the **production** Supabase, Worker, Brevo, and VAPID infrastructure — test data lands in prod, so use throwaway accounts and clean up after.

For enabling push and email notifications, see [services/email-hook/SETUP-NOTIFICATIONS.md](./services/email-hook/SETUP-NOTIFICATIONS.md).

## Project Structure

```
src/
  app/
    router/                  # Vue Router config and navigation guards
    theme/                   # Design tokens, typography, safe-area
  core/
    auth/                    # Session trust (offline-adopted sessions)
    components/              # Shared UI (overlays, buttons, icons registry, snackbar, ...)
    composables/             # Shared composables (useSnackbar, usePwaUpdate, ...)
    constants/               # Zod-validated env, feedback links
    exceptions/              # Custom error classes
    i18n/                    # vue-i18n setup, locale detection/persistence
    logging/                 # Logger composable wrapping consola
    offline/                 # IndexedDB data cache, write queue, replay, reconnect
    realtime/                # Shared Supabase Realtime subscription primitive
    utils/                   # Supabase client, phone normalization, LV95, uploads
  features/
    auth/                    # Email OTP sign-in
    calendar/                # Calendar page, availability, calendar feed sync
    contacts/                # Contacts, contact methods, device/vCard import
    friendships/             # Friend requests, friendships, blocks
    i18n/                    # Locale store
    map/                     # MapLibre map, markers/clusters, overlays, offline map
    notifications/           # Inbox, push registration, notification preferences
    onboarding/              # Guided product tour (driver.js)
    tour-links/              # Linking same-objective tours between friends
    tours/                   # Tours, GPX, attachments, suggestions, list/filters
    user/                    # Profile, onboarding page, phone verification
  locales/                   # en.json, de-CH.json
  sw.ts                      # Service worker (precache, runtime caching, push)
test/                        # Unit tests mirroring src/ structure
supabase/
  config.toml                # Local stack config (auth, hooks, SMTP, SMS); no [db.vault]
  migrations/                # Versioned schema changes
  tests/                     # pgTAP RLS / notification tests
  seed.sql                   # Local-only test data (auto-loaded on `supabase db reset`)
  .env / .env.example        # Secrets for env() interpolation in config.toml
services/
  email-hook/                # Cloudflare worker (Auth email hook, notification delivery, calendar)
    .dev.vars                # Local worker secrets (gitignored)
```

## Authentication

The app uses **email OTP** via Supabase:

1. Enter email address
2. Receive 6-digit OTP code — production uses Brevo templates via the Send Email Hook; locally the default is mode A (Inbucket capture at `http://127.0.0.1:54324`)
3. Enter code in app to authenticate

Phone numbers are verified separately. In production via Twilio Verify; locally seeded test users come pre-verified, and `[auth.sms.test_otp]` (fixed code `123456`) short-circuits the verification flow if re-triggered.

## Friendships & tour visibility

Verified-phone users befriend each other and share tours. Who can read which tour,
how much of it is exposed (per-tour `private`/`friends` visibility + non-partner
detail gating), the two-layer authorization model, and the shared-tour notifications
are documented in **[docs/friendships-and-tour-visibility.md](docs/friendships-and-tour-visibility.md)**.
How a client call is authorized in the database (roles, function grants, SECURITY DEFINER,
`search_path`) is explained in **[docs/supabase-rpc-authorization.md](docs/supabase-rpc-authorization.md)**.
