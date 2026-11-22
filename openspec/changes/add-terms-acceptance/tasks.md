# Tasks

## 1. Legal texts

- [x] 1.1 Terms, privacy, deletion and imprint pages (EN, DE) and `about.*` in both locales, from `.review/legal/terms.py` (legal review PASS)
- [x] 1.2 Onboarding, release-note and map-attribution wording (no reliance)

## 2. Terms feature

- [x] 2.1 `features/terms/domain`: `TERMS_VERSION`, `termsGate()` with the four states
- [x] 2.2 `features/terms/data`: `terms_status()` and `accept_terms()` through `core/supabase`
- [x] 2.3 `features/terms/presentation`: store (status, cache, re-check, accept), `TermsPage`
- [x] 2.4 Locales `terms.*` (EN, DE): page texts, states, "what changed" per version

## 3. App shell

- [x] 3.1 `_layout.tsx`: the terms route group; signed-in stores, welcome and held links wait for `pass`
- [x] 3.2 `src/app/accept-terms.tsx`: compose the page with sign-out and deletion
- [x] 3.3 Sign-up caption and `auth/legal` route
- [x] 3.4 `AboutPage` effective-date line; profile route passes it
- [x] 3.5 Trail sheet source caption
- [x] 3.6 Web: the app covered until session and terms are known (no launch screen there)
- [x] 3.7 Web tab bar: `TabList` a direct child of `Tabs` (found in review: tabs never switched on the web)

## 4. Outbox

- [x] 4.1 `replay.ts`: `terms_not_accepted` waits (no attempt, drain stops); accepting drains

## 5. Tests and checks

- [x] 5.1 `termsGate()` table, the store (offline cache, accept, refusal), the page's actions, the outbox rule, the layout guard
- [x] 5.2 `npm run check`
- [x] 5.3 Persona review (amateur-athlete) on the web build against the local backend (PASS, round 2)
