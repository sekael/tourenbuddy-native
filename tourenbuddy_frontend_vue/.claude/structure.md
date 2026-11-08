# Project Structure

```
src/
  app/
    router/index.ts           # Manual route definitions + auth guards
    theme/                    # global.css, tokens.css, typography.css, safe-area.css
  core/
    auth/                     # session-trust (offline-adopted, unverified sessions)
    components/               # Shared UI: adaptive-overlay, bottom-sheet, dialog-window, side-drawer,
                              #   base-button/icon/icon-button, icons.ts registry, snackbar, offline indicators
    composables/              # use-snackbar, use-is-desktop, use-pwa-update, use-formatter, use-scroll-lock, ...
    constants/                # env.ts (Zod-validated), feedback.ts
    exceptions/               # Custom error classes
    i18n/                     # vue-i18n instance, locale detection/persistence, zod error map
    logging/                  # use-logger (consola wrapper)
    offline/                  # IndexedDB data cache, cachedLoad, mutate() seam, write queue, replay, reconnect
    realtime/                 # use-realtime-subscription (shared, refcounted, visibility-paused)
    utils/                    # supabase client, phone-normalize, wgs84-to-lv95, storage-upload, app-version
  features/
    auth/                     # Email/OTP auth (presentation only, no domain layer)
    calendar/                 # Calendar page, availability, calendar feeds (DDD)
    contacts/                 # Full DDD: entities, repos, vCard/Contact Picker import, phone actions
    friendships/              # Full DDD: friend requests, friendships, user blocks
    i18n/                     # Locale store (presentation only)
    map/                      # MapLibre integration, Swisstopo styles, marker/cluster layers, offline map
    notifications/            # Full DDD: inbox, push subscriptions, notification preferences
    onboarding/               # Guided product tour (driver.js), presentation only
    tour-links/               # Full DDD: linking same-objective tours between friends
    tours/                    # Full DDD: GPX, attachments, suggestions, Swisstopo elevation/name services
    user/                     # Full DDD: profile, onboarding page, phone verification
  locales/                    # en.json, de-CH.json (parity enforced by `npm run check:locales`)
  sw.ts                       # Service worker (injectManifest): precache, runtime caching, push
test/                         # Mirrors src/ structure (Vitest + happy-dom)
supabase/
  migrations/                 # Immutable, timestamped; see conventions → Supabase / Database
  tests/                      # pgTAP suites (`supabase test db`)
  seed.sql                    # Local-only seed (5 users, tours, friendships)
services/email-hook/          # Cloudflare Worker: Auth email hook, notification delivery, calendar sync/feed
```

## Feature Internal Structure (full DDD)

```
feature_name/
  data/
    models/                   # Zod schemas + inferred types
    repositories/             # Implementations (Supabase)
    services/                 # External API calls (if needed)
  domain/
    entities/                 # Pure TypeScript business objects
    repositories/             # Abstract interfaces
  presentation/
    stores/                   # Pinia composition stores
    pages/                    # Routed page components
    components/               # Feature-specific components
    composables/              # Feature-specific composables (if needed)
```
