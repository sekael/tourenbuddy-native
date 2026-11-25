# Proposal

## Why

The owner wants this repository to be the single source of truth for every deployment, web and
native (2026-11-22). Today the web is the Vue PWA in `sekael/tourenbuddy_frontend_vue` (#346 D21),
and the Expo web build here is a Material restyle of the native screens that the owner found not
releasable. This change ports the PWA itself into the Expo web build: **same design, same features,
same flows as PWA release 0.54.0**. Polish (Material 3 Expressive, D8; navigation bar/rail, D19;
first-load budget R3) comes later, on top of a web app long-time users already know.

It replaces the approach of sekael/tourenbuddy_frontend_vue#386 (restyle first) with "port first,
polish later" and reverses D21's "web stays Vue" for the code. The production web cutover itself
stays #374: this change deploys the web only to pull-request previews until the owner switches it on.
To record in #346 as **D22**.

## What Changes

- **Web presentation = the PWA's presentation, ported.** Every PWA page, overlay, component and
  composable becomes a React DOM web file (`*.web.tsx`); each SFC's scoped CSS becomes a CSS Module,
  the PWA theme (`tokens.css`, `global.css`, `typography.css`, `safe-area.css`) global CSS. Same
  markup, tokens, icons, copy, motion and breakpoints. iOS and Android are unchanged.
- **Shared below the presentation:** the web reads the domain, data, stores (Zustand), offline seam,
  Realtime and auth store this repository already ported from the PWA. Where a native store behaves
  differently from the PWA's, the web keeps the PWA behavior.
- **The PWA's addresses and guards on the web:** `/`, `/auth/verify-otp`, `/onboarding`, `/map`,
  `/calendar`, `/friends/<id>/backfill-collisions`, `/?notification=<id>`, the same redirects. One
  deliberate difference: the terms gate moves from `/terms` to `/accept-terms`, because `/terms` is
  the public legal page on the shared domain.
- **The PWA's copy:** its English and Swiss German catalogs, converted to i18next syntax, as the web's
  own namespace, so no text changes.
- **PWA platform features back on the web:** web manifest and icons, the service worker (app shell
  precache, offline navigation, tile and data caching, offline regions, push, notification click),
  the update prompt (no install banner: owner, 2026-11-23), Web Push, the offline data cache and
  outbox in the browser, the guided product tour, the PDF viewer, vCard and Contact Picker import.
- **Same-origin carry-over:** served on the PWA's origin, the web app keeps a user's session,
  settings, installed icon, push subscription and offline regions, so switching is invisible.
- **Web deploys from this repository:** pull-request previews of the web build (Pages project
  `tourenbuddy-native`), and a production web deploy in `release.yml` behind the repository variable
  `WEB_DEPLOY` (off: `public/` only, as today).
- **Migration checklist:** `docs/vue-repo-migration.md` lists every setting, secret and file the owner
  moves by hand from the Vue repository: for the web cutover now, for the backend later.

Not in this change: moving `supabase/` and `services/email-hook` (D3 stands; listed in the
checklist), design polish, any change to the iOS or Android app.

## Capabilities

### New Capabilities

- `web-app`: on the web the app is the PWA: look, addresses, guards, installability, service worker,
  update prompt, Web Push, offline data, same-origin carry-over.

### Modified Capabilities

Each drops the web clause it pins today (D8/D19-era Material web) and leaves the web to `web-app`.
Wording only for iOS and Android; no native behavior changes.

- `app-navigation`: tabs and the thumb-zone menu are iOS and Android only.
- `offline-data-cache`, `offline-write-sync`: "nothing cached / never queue on the web" removed.
- `project-scaffolding`: the checks build the service worker; web previews on pull requests; the
  release deploys the web app when switched on (supersedes `add-release-pipeline`'s "never a web
  app").
- `design-system`, `bottom-sheet`, `adaptive-lists-forms`, `tour-action-bar`, `offline-map`,
  `tour-attachments`: web clauses scoped out.
- `public-pages`: an English legal page forwards a German-speaking visitor to the German one (the
  PWA showed its terms in the app's language).

Checked and left as they are, because the PWA already matches them: `responsive-overlay` (bottom
sheet below 600 px, 560 px dialog), `speed-dial-icon-transition` (menu ⇄ close quarter turn),
`map-integration` (the speed dial is the PWA's), the typography and icon requirements of
`design-system` (self-hosted Inter without a late swap, SVG icons).

## Impact

- **Code:** about 30 000 lines of Vue presentation become web files under `src/features/*/presentation`
  and `src/core/web/`; web routes in `src/app` with `.web.tsx` variants; `tables.web.ts` and the file
  cache get a browser implementation.
- **Dependencies (web only):** `workbox-*` (service worker, as the PWA), `driver.js` (guided tour),
  `pdfjs-dist` (PDF viewer). Each is what the PWA ships; none reaches the native bundles.
- **CI:** `checks.yml` keeps the web export; `release.yml` and two new preview workflows deploy it.
- **Order:** after `add-native-polish`, `add-realtime-core` and `add-release-pipeline` are archived
  (their spec deltas touch the same requirements).
- **Owner:** secrets and Pages settings from the checklist before previews and before the cutover.
