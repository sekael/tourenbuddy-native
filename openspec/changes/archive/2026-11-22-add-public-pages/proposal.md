# Proposal

## Why

The stores need public pages before review (#346 section 9 blockers): a privacy policy and terms in
the listing and the app, an imprint, and a web address where an account can be deleted (Play's Data
safety form). `tourenbuddy.ch` is served by this repo's Pages project (`public/`, since #368), so
the pages live here. Checked 2026-11-09: the apex answers only the association file (`/` is 404) and
the live PWA is served on `test.tourenbuddy.ch`, so nothing live is displaced; `www.tourenbuddy.ch`
is not connected (522). Phase 2 (#369) items B2 (public deletion page), B3 (legal pages), B4 (link
association) and B5 (`app-config.json`); the backend half is `add-native-backend` in the Vue repo.

## What Changes

- **Legal pages** in English and German: `/privacy`, `/terms`, `/imprint` and `/de/…`, static
  HTML with the app's look, linked from Profile (Phase 3) and the store listings. The texts are
  drafts covering #346 B3's list (Swiss FADP and GDPR, all data in section 9, processors, retention,
  deletion) and must be legally reviewed before the store submission; the imprint's postal address is
  the owner's to fill in.
- **Account deletion page** `/account-deletion` (+ `/de/…`): how to delete in the app, what is
  deleted, and the email route for someone who no longer has the app.
- **Link association:** `applinks` for both bundle ids in `.well-known/apple-app-site-association`
  (Universal Links, `add-native-polish`). `assetlinks.json` waits for the Play App Signing key
  (first Play upload); `docs/publishing.md` says how.
- **`app-config.json`** with the minimum supported versions per platform (B5), JSON content type and
  no caching beyond five minutes.

## Capabilities

### New Capabilities

- `public-pages`: the public legal and account pages and the app's published configuration.

## Impact

- `public/` (pages, stylesheet, `.well-known`, `app-config.json`, `_headers`), `docs/publishing.md`.
- Owner: legal review, imprint address, Play App Signing SHA-256 later.
