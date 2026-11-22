# Proposal

## Why

The terms of use exclude the operator's liability for activities planned with TourenBuddy and make
users solely responsible for them. Terms only bind a user who was shown them and accepted them, and
today nobody does: there is no link at sign-up and no acceptance anywhere. A Swiss legal review
(eight rounds, 2026-11-22, reviewer PASS) rewrote the legal pages and specified how acceptance must
work so the terms hold. TourenBuddy is free, non-commercial and offered in Switzerland only.

## What Changes

- **Legal pages, website and in-app (word for word):** the terms say what TourenBuddy is (stores
  and shares your own plans; no advice, no guide, no emergency service), that every activity is the
  user's own risk and responsibility, and exclude liability as far as Swiss law allows (all but
  intent and gross negligence, personal injury included), with a narrow indemnity, German as the
  governing version and changes accepted in the app. The privacy policy names the operator,
  Switzerland only (FADP, no GDPR), recipient countries, the acceptance record and its retention,
  and a 30-day answer to requests. The deletion page lists the acceptance record. The imprint
  names the operator as a private, non-commercial project.
- **Acceptance before use:** after sign-in, a full-screen page blocks the app until the user
  accepts the current terms. It summarises the two clauses users would not expect (personal injury,
  indemnity), links to the full terms and privacy policy, and offers sign out and account deletion.
  New accounts see it right after the email code; existing accounts at their next sign-in or
  launch; everyone again when the terms change, with what changed.
- **States the page can be in:** accept; the app is too old to accept (update message); not
  available yet (a newer app before the server's terms change); offline without an earlier
  acceptance (accepting needs a connection). Offline after an earlier acceptance, the app opens.
- **Sign-up:** a line under "Create account" links the terms and the privacy policy before the
  address is collected.
- **Offline edits:** edits saved offline wait for the acceptance and are never lost to it.
- **Reliance:** onboarding and release-note wording no longer suggests routes or difficulty can be
  relied on; the ski-route detail sheet says where its details come from and to check conditions.
- **About pages:** a newer terms text not yet in force says from when it applies.

## Capabilities

### New Capabilities

- `terms-acceptance`: accepting the terms before use, the gate's states, and the legal texts'
  core promises.

### Modified Capabilities

- None in this repository's specs; the backend (record, enforcement, retention) is the Vue
  repository's change `add-terms-acceptance`.

## Impact

- Native: a root-level gate route next to the update gate, a terms store, the sign-up screen, the
  outbox replay, the About pages, the trail sheet, both locales, `public/` legal pages.
- Backend (Vue repository): `terms_acceptances`, `terms_status()`, `accept_terms()`, write
  enforcement behind a switch, retention; the PWA gets the same page.
- Release: the native web app, the native apps and the PWA must all carry the gate before the
  backend's enforcement switch is turned on (design, Rollout).
