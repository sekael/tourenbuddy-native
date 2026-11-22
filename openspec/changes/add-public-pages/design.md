# Design

## Decisions

### D1: Static HTML in `public/`

`npx expo export --platform web` copies `public/` into `dist/`, and Pages serves `privacy/index.html`
at `/privacy` before the single-page fallback. Plain HTML with one shared stylesheet
(`/legal.css`, the app's tokens: Inter is bundled with the web app but these pages use the system
font stack so they load alone), no script, readable from 320 px. Each page links to its other
language. English at the root, German under `/de/` (the app links to the one matching its language).

### D2: What the texts cover

Privacy: controller (the owner), data and purposes from #346 section 9's table, legal bases (contract,
consent for push, legitimate interest for safety reports), recipients and processors with their
locations (Supabase, Cloudflare, Brevo, Twilio for SMS codes, Apple for push on iOS, Google for push
on Android, swisstopo for map tiles), retention (inbox 90 days, everything else until deletion,
reports anonymized), rights under FADP and GDPR, the deletion path, no tracking, contact. Terms:
service, account, user content and friends-only sharing, acceptable use and reporting, availability,
liability for mountain tours (planning aid only), Swiss law. Imprint: name, address placeholder,
email.

### D3: Association file

`applinks.details` for `R26MV7TAH3.ch.tourenbuddy.app` and `.dev` with components matching every
path (`/*`) so `?notification=` links and future screen links open the app; `webcredentials`
unchanged. Legal pages are excluded (`"exclude": true` for `/privacy*`, `/terms*`, `/imprint*`,
`/account-deletion*`, `/de/*`) so they open in the browser even with the app installed.

### D4: `app-config.json`

`{"min_supported_ios":"0.1.0","min_supported_android":"0.1.0","ios_store_url":null,"android_store_url":null}`:
store URLs are filled in once the listings exist; the gate falls back to the store search when null.
`_headers`: `Content-Type: application/json`, `Cache-Control: max-age=300`.
