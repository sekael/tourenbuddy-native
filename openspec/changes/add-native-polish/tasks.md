# Tasks

## 1. Deep links

- [x] 1.1 `core/links/resolve.ts` with tests (notification ids, app paths, both hosts, both schemes, junk)
- [x] 1.2 `+native-intent.tsx`; push tap handler uses the resolver; pending link kept across sign-in
- [x] 1.3 `applinks:tourenbuddy.ch` in `associatedDomains` (`?mode=developer` in dev builds); Android intent filters with `autoVerify` deferred with Android (assetlinks needs the Play signing key)

## 2. Updates

- [x] 2.1 `core/update/` gate (fetch, bound, cache, semver compare) with tests; update screen; store links

## 3. Permissions, files, other apps

- [x] 3.1 Usage strings (en, de) via `locales`; blocked Android permissions
- [x] 3.2 GPX imported type; `LSApplicationQueriesSchemes`; Android `<queries>`

## 4. Form factors and accessibility

- [x] 4.1 No orientation lock; iPad layout check; keyboard behavior in forms and sheets (owner checks DES-4, DES-5)
- [x] 4.2 Labels and hints on map controls; Reduce Transparency (system glass) and Bold Text (app text) in custom views; largest text pass (A11Y-2, A11Y-3)

## 5. Icons, launch, performance, web

- [ ] 5.1 Icon Composer slot and Android monochrome icon in `app.config.ts` (artwork from the owner: open); launch screen check (DES-6)
- [x] 5.2 Performance pass (no blocking work before the first frame, listeners released); owner's Instruments checks in the test plan
- [x] 5.3 Web keyboard and semantics pass (map sheets as a side panel or bottom sheet beside the live map, Escape, browser dialogs for alerts)

## 6. Compliance

- [x] 6.1 Privacy manifest in `app.config.ts`; target API 36 is SDK 58's default (no override)
- [x] 6.2 `docs/glass-exceptions.md`; `docs/manual-test-plan.md` cases for iOS Device Hub and iPhone 15

## 7. Verify

- [x] 7.1 `npm run check`; independent review until satisfied (approved in round 5, 2026-11-12)
