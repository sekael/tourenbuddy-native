# Design

## Context

- PWA `tourenbuddy-frontend` 0.54.0: ~32 000 lines of Vue SFCs (template, script, scoped CSS) and
  ~9 400 lines of Pinia stores and composables in the presentation layer; 7 routes, everything else
  overlays on `/map`.
- This repository already ported the PWA's domain, data and stores (Phases 1–4) for the native app,
  and the web build renders the native screens through the Material components of the adaptive layer.
- Metro in SDK 58 bundles global CSS and CSS Modules (`*.module.css`) for web.

## Goals / Non-Goals

Goals: a long-time PWA user cannot tell the web app from the PWA; one repository deploys web and
native; the native app is untouched.

Non-goals: design polish (D8, D19, R3 come later); moving the backend; converging the web and native
presentation layers.

## Decisions

### D1 — Port the PWA's markup and CSS, don't restyle the shared components

Web pages and components are React DOM (`<div className>`) in `*.web.tsx` files, a line-by-line port
of each SFC. Why: "design unchanged" holds only if the CSS is the PWA's CSS. React Native Web
styles cannot express what the PWA uses (`:has()`, container queries, nesting, `env()` insets,
`backdrop-filter`, CSS transitions on enter and leave), and the PWA's navigation (one map page with
overlays, side drawer on desktop) is not the native tab structure. Rejected: restyling the Material
layer, which is what the owner turned down on 2026-11-22.

Cost: two presentation layers until the polish converges them. Accepted: the layers below are shared.

### D2 — Scoped CSS becomes CSS Modules; the theme is global CSS

`<style scoped>` → `name.module.css` next to the component, class names kept (`styles['tour-row']`),
`:deep(x)` → `:global(x)`. `src/app/theme/*.css` → `src/core/web/theme/*.css`, imported once by the
web root layout. Vue `<Transition>` / `<TransitionGroup>` (27 uses) → one small hook that applies the
same `*-enter-from` / `*-leave-to` classes, so the PWA's transition CSS moves over unchanged.

### D3 — Web components read the native stores

Pinia stores are not ported again: the Zustand stores in `features/*/presentation/stores` already
are their port. Components select from them (`useToursStore(s => s.tours)`). PWA composables that are
presentation logic (filters, suggestion diff, handle reorder, sheet inset, exit animation) become
hooks next to the components. Where a native store's behavior differs from the PWA store (a native
default, a native-only action), the web keeps the PWA behavior in its hook; stores get no web branches.

### D4 — PWA addresses through Expo Router platform routes

Web pages are route files at the PWA's paths with `.web.tsx` variants (Expo Router needs a non-web
file next to each: on native it redirects to its native place, e.g. `map.tsx` → `/`). The web root
layout `src/app/_layout.web.tsx` holds the PWA's guards (signed out → `/`, terms → `/accept-terms`,
signed in on `/` → `/map`, incomplete profile → `/onboarding` unless skipped or offline with nothing
cached) in one place, like `Stack.Protected` on native. Native-only routes redirect to `/map` on
the web. Exact mechanics verified against the SDK 58 Expo Router docs before the first route.

`/terms` stays the public legal page (`public/terms/`, same Pages project), so the gate moves to
`/accept-terms`, the native route's name. Only the app links there; no user-visible address changes.

### D5 — The PWA's catalogs as the web namespace

`src/locales/web/{en,de-CH}.json`, converted from the PWA once by a script (`{x}` → `{{x}}`, pipe
plurals → `_one` / `_other`, `@:` links resolved, `{'@'}` literals unescaped), loaded as namespace
`web` on the web only and typed against `web/en.json`. Why: guarantees identical copy; merging the
two catalogs is polish. The locale parity check covers both namespaces.

### D6 — Icons and fonts from what exists

The PWA's icon names map onto the registry in `src/core/adaptive/icons.ts` (same Material Symbols
Outlined paths plus the `tb` glyphs), rendered as inline `<svg>` on the web; missing names are added
to the registry. Inter: the bundled latin variable subset already used on the web (covers 400/500/600
and the umlauts); no font package.

### D7 — Offline data in the browser, through the existing seam

`core/offline/tables.web.ts` gets an IndexedDB implementation of `Tables` (per user, cleared on
sign-out) and `offlineStorage = true`; the file cache gets a Cache Storage one. `mutate()`, the write
queue, replay and the pending indicator are shared code already. Reverses D8's "no offline web copy",
because the PWA has it. Reachability on the web: `navigator.onLine` plus the Realtime state, as the
PWA.

### D8 — The PWA's service worker, built after the export

`src/sw.web.ts` is the PWA's `sw.ts` (Workbox: precache, navigation fallback, tile and GPX
caching, offline regions offline-first, push, notification click). `scripts/build-sw.mjs` runs after
`expo export --platform web` (`npm run build:web`): bundles it with esbuild and defines the precache
manifest (every shell file up to 8 MB with its content hash, `index.html` the only page), output
`dist/sw.js`. Rejected: `workbox-build` (`injectManifest` alone pulls in a large dependency tree
for a 20-line list). The navigation fallback excludes the public pages
(`/privacy`, `/terms`, `/imprint`, `/account-deletion`, `/de/*`, `/.well-known/*`, `/app-config.json`).
Update prompt and install banner as in the PWA (`workbox-window`). Rejected: hand-written worker
(re-implements Workbox's precache versioning).

### D9 — Same-origin carry-over

Served on the PWA's origin, the web app must reuse what the PWA stored: the Supabase session key
(default `sb-<ref>-auth-token`, same client default on both), the PWA's `localStorage` keys (locale,
pace, dismissed prompts, guided-tour state), the `offline-map-tiles` cache and `offline-regions`
database, and `/sw.js` as the worker's URL so the installed PWA's registration updates through the
normal prompt instead of being orphaned. The data cache is a cache (refetched); the PWA's outbox is
replayed if its entries match the shared queue's shape, otherwise listed as a known gap before the
cutover.

### D10 — Deploys gated, previews first

- Pull requests: web export + service worker + `public/` → Pages project `tourenbuddy-native`, branch
  alias `<slug>.tourenbuddy-native.pages.dev` (already in the Worker's CORS), sticky PR comment,
  cleanup on close. Ported from the PWA's `deploy-preview.yml` / `cleanup-preview.yml`.
- Release: `release.yml` deploys web + `public/` when `vars.WEB_DEPLOY == 'true'`, otherwise
  `public/` only (today). The owner flips it at the cutover (#374).
- `public/_headers` merges the PWA's headers (frame-ancestors, nosniff, immutable `/_expo/static/*`,
  no-cache `index.html`, `sw.js`, `manifest.webmanifest`).

### D11 — Delivery

One change, built in stages that each leave the web build working (see `tasks.md`); the owner commits
per stage. Persona review on the finished web build, side by side with the PWA, until it passes.

## Risks / Trade-offs

- **Size (~30 000 lines):** several sessions. Mitigation: stage order puts the shell, map and tours
  first; every stage passes `npm run check`.
- **Divergence while porting:** PWA changes landing meanwhile must land here too (#386 task 8).
  Baseline is 0.54.0; later PWA releases are diffed in before the review.
- **Two presentation layers:** a feature change touches both until polish converges them.
- **Expo Router web quirks** (platform routes, typed routes on web-only paths): verified on the first
  route before the rest follow.
- **Bundle size:** one web bundle (async routes off) plus `pdfjs-dist` and `driver.js`. Measured and
  reported, not gated (R3 is polish).

## Migration Plan

1. Owner sets the preview secrets (checklist part A1).
2. Stages 1–7, previews on each PR.
3. Persona review until PASS, then owner review.
4. Cutover (#374): checklist part A2, `WEB_DEPLOY=true`, Vue repo deploys off.
5. Backend move later: checklist part B.

## Open Questions (defaults apply unless the owner says otherwise)

1. One pull request for the whole port, or one per stage? Default: one per stage, so each is
   reviewable; web stays preview-only throughout.
2. Origin at the cutover: default the PWA's `test.tourenbuddy.ch` moved onto `tourenbuddy-native`
   (carry-over, D9); apex later.
3. Backend folders (`supabase/`, `services/`): default stay in the Vue repo for this change.
