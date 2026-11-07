## Purpose

Cloudflare Worker (`services/email-hook`) that sends the sign-in OTP email for Supabase Auth, delivers push/email for notification events the database records, and serves the calendar sync endpoints (see `calendar-sync`). It is deployed manually with `wrangler deploy`, not by CI.

## Requirements

### Requirement: Supabase Auth send-email hook
The Worker SHALL handle Supabase Auth's Send Email hook on `POST` requests that match no other route. It SHALL verify the request with the Standard Webhooks signature (`webhook-id`, `webhook-timestamp`, `webhook-signature`) against `SEND_EMAIL_HOOK_SECRET`, and SHALL send the OTP via the Brevo template for the user's base locale (`user_metadata.locale`: `de`/`de-CH` → German, anything else → English).

#### Scenario: Valid hook call
- **WHEN** Supabase Auth posts a correctly signed payload carrying `email_data.token`
- **THEN** the Worker sends the locale-matching Brevo OTP template with the code and responds 200

#### Scenario: Bad signature
- **WHEN** the signature does not verify
- **THEN** the Worker responds 401 and sends nothing

#### Scenario: Missing OTP configuration
- **WHEN** `BREVO_API_KEY`, `SEND_EMAIL_HOOK_SECRET`, `BREVO_TEMPLATE_EN` or `BREVO_TEMPLATE_DE` is missing
- **THEN** the Worker responds 500 `missing_configuration`

#### Scenario: Provider failure
- **WHEN** Brevo rejects the send
- **THEN** the Worker responds 502 `email_delivery_failed`

### Requirement: Notification event dispatch route
The Worker SHALL expose `POST /notify/event`, called only by the database dispatch trigger (`pg_net`, after commit) with one `notifications` row as the body and the shared secret in `x-notify-secret`. The secret SHALL be compared in constant time. The Worker decides only HOW to deliver — the database already decided who is notified about what: it SHALL skip recipients without a profile or who muted the row's type, push to every registered device of the recipient, and email when `notif_email_enabled` is on, with copy localized to the recipient's locale and a deep link to `<APP_URL>/?notification=<id>`.

#### Scenario: Missing or wrong secret
- **WHEN** the request lacks the correct `x-notify-secret`
- **THEN** the Worker responds 401 and dispatches nothing

#### Scenario: Muted type
- **WHEN** the recipient has the row's type in `notif_muted_types`
- **THEN** the Worker responds 200 with `skipped: 'muted'` and sends nothing

#### Scenario: One channel fails
- **WHEN** push succeeds but the email send rejects
- **THEN** the failure is logged and the Worker still responds 200

### Requirement: VAPID and service-role secrets
The Worker SHALL use Supabase service-role credentials to read profiles, emails and push subscriptions and to write calendar sync state, and SHALL use VAPID credentials to sign Web Push requests.

#### Scenario: Missing dispatch secret
- **WHEN** `NOTIFY_WEBHOOK_SECRET` is missing
- **THEN** `/notify/event` responds 500 `missing_configuration`

#### Scenario: Missing email template id
- **WHEN** the Brevo template id for a notification email is missing or not numeric
- **THEN** that email is skipped with a logged configuration error, and push delivery is unaffected

### Requirement: Stale endpoint pruning
The Worker SHALL delete `push_subscriptions` rows when the Web Push service returns 404 or 410 for that endpoint.

#### Scenario: Push returns 410
- **WHEN** dispatching to a stored endpoint returns HTTP 410
- **THEN** the row identified by that endpoint is deleted before the Worker returns

### Requirement: CORS limited to the app's origins
Browser-facing responses (`/calendar/sync` and its preflight) SHALL carry CORS headers only for the app's own origins: local dev, `test.tourenbuddy.ch`, `tourenbuddy.ch`, `www.tourenbuddy.ch`, and `*.touringbuddy.pages.dev` previews. Server-to-server routes (`/notify/event`, the Auth hook, the `.ics` feed) SHALL NOT carry CORS headers.

#### Scenario: Unknown origin
- **WHEN** a preflight arrives from an origin outside the allowlist
- **THEN** the response carries no `Access-Control-Allow-Origin` header
