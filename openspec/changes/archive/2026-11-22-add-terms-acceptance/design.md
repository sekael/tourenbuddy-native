# Design

Source: `.review/legal/acceptance.md` (legal review PASS, 2026-11-22). The backend half is the Vue
repository's change `add-terms-acceptance`; this is the native half.

## D1. One version, the server decides

`TERMS_VERSION = '2026-11-22'` (the date the text was settled) is bundled in the app. The backend
holds the version in force (`terms_current_version()`), and `terms_status()` returns it with the
user's latest accepted version. Versions are ISO dates, so they compare as strings.

`termsGate(bundled, status)` (pure, domain):

| Condition | State |
|---|---|
| bundled < current | `update` |
| accepted = current, bundled ≥ current | `pass` |
| accepted ≠ current, bundled = current | `accept` (`changed` when an earlier version was accepted) |
| accepted ≠ current, bundled > current | `unavailable` (re-checked on foreground and every 2 minutes) |

Offline or unreachable: the last confirmed status for this user (entity cache, `terms:<uid>`)
decides. `pass` stays `pass`; no cached status → `accept` with the connection note and the accept
button disabled.

## D2. A third route group, in the one place routes follow the session

`src/app/_layout.tsx` keeps both `Stack.Protected` groups and adds one: the app group's guard is
`isLoading || (signedIn && gate === 'pass')`; the new group (`terms`) is
`signedIn && !isLoading && gate !== 'pass'`. While the status is first fetched with nothing cached,
the terms route shows a quiet loading state, so nothing of the app flashes. The welcome sheet and
held links wait for `pass`. The signed-in stores start only on `pass`, so nothing writes before the
acceptance (no push-token registration, no release-note marker).

## D3. The page

`src/app/accept-terms.tsx` (the route `/accept-terms`: on the web, `/terms` is the static terms page in `public/`) composes `TermsPage` (features/terms) with sign-out (auth store) and account
deletion (profile store) passed in as callbacks, since features don't import each other. It uses the
adaptive `Screen` path, so the full terms and privacy policy open as pages over it (`AboutPage`) and
back returns to it. Deletion asks for confirmation like Profile does.

## D4. Outbox

The backend refuses a client write for a missing acceptance with `terms_not_accepted`
(`P0001`). `replay.ts` treats that as waiting: the entry stays, no attempt is counted, the drain
stops (every later entry would be refused too). Accepting starts a drain. Every other refusal keeps
today's behaviour.

## D5. Sign-up and About

Sign-up: a caption under the button with two links to `auth/legal?name=terms|privacy`, a route in
the auth stack that renders `AboutPage`. About pages take an optional `effective` date: the profile
route passes it when the bundled version is newer than the one in force.

## Rollout

1. Backend migration (table, RPCs, version 2026-11-22, enforcement switch off), the PWA gate, the
   native web app and the native apps with this change; `min_supported_ios` raised to that release.
2. At least a week later, once the PWA's old shells are replaced: the enforcement switch on.
3. Later changes: ship apps with the new bundled version first, bump the backend the same day as the
   web deploy.
