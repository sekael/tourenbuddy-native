# tourenbuddy-email-hook

Cloudflare Worker with three jobs:

1. **Supabase "Send Email Hook"** — receives Supabase auth email payloads via a Standard-Webhooks-signed request, picks a Brevo transactional template by the user's locale, and sends the OTP code email.
2. **Notification delivery** — `POST /notify/event`, called by the database for every new inbox row; sends push and email.
3. **Calendar** — scheduled and on-demand calendar feed sync, plus the outbound `.ics` tour feed.

Spec: [`openspec/specs/auth-email-hook`](../../openspec/specs/auth-email-hook/spec.md). Deploys are manual (`wrangler deploy`); CI never ships the Worker.

## Brevo templates

Create the Brevo transactional templates under **Transactional → Templates → Create a template**.

### OTP sign-in templates

| Template name | Subject (Brevo)                 | Language |
| ------------- | ------------------------------- | -------- |
| `otp_en`      | `Your TourenBuddy sign-in code` | EN       |
| `otp_de`      | `Dein TourenBuddy-Anmeldecode`  | DE       |

Required template params (passed by Worker):

- `{{ params.otp }}` — the 6-digit sign-in code
- `{{ params.email }}` — the recipient's email address

Include a "Do not share this code. It expires in 1 hour." warning in the template body.

### Notification templates

Notification emails use one template per type and locale (copy-ready drafts in `brevo-templates/`), parameterized by `action`:

| Secret (EN / DE)                              | Used for                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `BREVO_TEMPLATE_FRIEND_RECEIVED_EN` / `_DE`   | friend request received                                                                      |
| `BREVO_TEMPLATE_FRIEND_RESPONDED_EN` / `_DE`  | friend request responded (outcome never disclosed)                                           |
| `BREVO_TEMPLATE_TOUR_UPDATES_EN` / `_DE`      | shared-tour created/updated/deleted, suggestions, weekly availability summary, tour reminder |
| `BREVO_TEMPLATE_TOUR_INTEREST_EN` / `_DE`     | collision, backfill digest, link created/declined, group joined/evicted                      |
| `BREVO_TEMPLATE_TOUR_LINK_DELETED_EN` / `_DE` | group dissolved                                                                              |

A missing or non-numeric template id skips that email (logged); push is unaffected.

Sender for all templates: `no-reply@tourenbuddy.ch`. Note the numeric `templateId` from each template's detail page — you need it for the matching env var.

## Secrets

Set all secrets via Wrangler before deploying:

```sh
wrangler secret put BREVO_API_KEY
wrangler secret put SEND_EMAIL_HOOK_SECRET
wrangler secret put BREVO_TEMPLATE_EN   # numeric ID of otp_en template
wrangler secret put BREVO_TEMPLATE_DE   # numeric ID of otp_de template
```

Notification and calendar secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, VAPID keys, `NOTIFY_WEBHOOK_SECRET`, the template ids above, optional `APP_URL`) are listed in [SETUP-NOTIFICATIONS.md](./SETUP-NOTIFICATIONS.md).

No `[vars]` configuration required in `wrangler.toml`.

## Deploy

```sh
npm install
wrangler login
wrangler deploy
```

Note the Worker URL from the deploy output — you need it to configure the Supabase Send Email Hook.

## Local dev

```sh
wrangler dev
```

## Notification route

One route fans out push + email for every notification event. See `SETUP-NOTIFICATIONS.md` for full operator setup.

### `POST /notify/event`

Called only by the database: an AFTER INSERT trigger on `public.notifications` POSTs the new row via `pg_net` (change `notification-inbox`). Clients never call it.

**Request**

```
x-notify-secret: <NOTIFY_WEBHOOK_SECRET>
Content-Type: application/json
{ "id": "<uuid>", "recipient_id": "<uuid>", "type": "friend_requests", "action": "received", "actor_name": "…", "tour_name": null, … }
```

**Behaviour**

- Constant-time secret check; 401 on mismatch, 500 if `NOTIFY_WEBHOOK_SECRET` is unset.
- Skips all dispatch if `type` is in the recipient's `notif_muted_types`.
- Dispatches Web Push to every registered device of the recipient (cleans up 410/404 endpoints). No account-wide push flag: rows exist ⇔ push enabled on that device.
- Sends Brevo email when `notif_email_enabled`, using the locale-matching template.
- Push/email link: `<APP_URL>/?notification=<id>` — the app marks the entry read and opens its target.
- Friend-request copy never reveals accept vs decline.

## Calendar sync (#287)

Uses the existing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` secrets; no new secrets. Spec:
[`openspec/specs/calendar-sync`](../../openspec/specs/calendar-sync/spec.md); design in the archived
change `openspec/changes/archive/2026-10-02-calendar-availability-sync/design.md` (D3–D10).

- **Cron** `0 */6 * * *` (`wrangler.toml` `[triggers]`) → `scheduled()` syncs every user with a feed.
- **`POST /calendar/sync`** — `Authorization: Bearer <user JWT>`; syncs the caller only. Returns
  `{ result: 'synced' | 'unchanged' | 'failed' | 'no_feeds' }`; per-feed errors are in
  `user_calendar_feeds.last_error`.
- **`GET /calendar/<feed_token>.ics`** — the user's own planned tours as an iCalendar feed. Any
  unknown or malformed token is a bare `404`.

Free plan: ~10 ms CPU and ~50 subrequests per invocation, cron included (≈ users × (feeds + 3)).
If `last_synced_at` stops advancing with no `last_error`, check the logs for `exceededCpu` /
"Too many subrequests" before suspecting a code bug.

Trigger the cron locally:

```sh
wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+*/6+*+*+*"
```

## Notification setup

For full operator setup instructions (VAPID generation, Brevo template creation, secrets, migration, env vars), see [SETUP-NOTIFICATIONS.md](./SETUP-NOTIFICATIONS.md).

## Tests

```sh
npm test
```
