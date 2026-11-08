# Ski-route data: storage and serving

How the self-hosted ski-route dataset is stored on Cloudflare Pages and how it travels to the app.
It is background reading. For operations (failed job, `force`, keepalive), see the runbook
`docs/ski-route-data.md`. Decisions and alternatives: OpenSpec change `self-hosted-ski-routes`
(`design.md` D1–D9).

## Big picture

```
Swisstopo STAC + GeoPackage ──(weekly GitHub Action: ogr2ogr → build.ts → tippecanoe)──▶ out/
                                                                                     │ wrangler pages deploy
                                                                                     ▼
                                     Cloudflare Pages project `tourenbuddy-data` (static files, global CDN)
                                     https://tourenbuddy-data.pages.dev
                                                                                     │ HTTPS, CORS *
                                                                                     ▼
App (MapLibre vector source + trail lookup) ◀── service worker caches ◀── browser HTTP cache
```

There is no server code. The data is plain static files on Cloudflare's CDN. That is the whole point:

- no database, so no Supabase egress;
- no Worker CPU;
- nothing to keep running;
- Pages bandwidth is unmetered.

The app and the data are separate Pages projects, so each deploys on its own schedule.

## What is stored

One Pages deployment holds exactly one dataset version:

```
/ski-routes.json                              manifest (TileJSON 3.0)          the only file whose content changes
/ski-routes/<version>/{z}/{x}/{y}.pbf         vector tiles, z11–z13            ≈2.6k files
/ski-routes/<version>/routes/<sacid>.json     one GeoJSON Feature per route    2,941 files (2025 release)
/_headers                                     response headers (Pages config, not served)
/_redirects                                   old version → current version (Pages config, not served)
```

`<version>` is the STAC `updated` timestamp of Swisstopo's GeoPackage, e.g. `2025-12-15T091422`. A
new Swisstopo release produces a new folder name. Files under a version folder never change after they
are published.

Only routes that carry route information (a `target_name`) from source `swisstopo_sac` are included.
The ski raster overlay from Swisstopo's WMTS still draws every route line. Our data only adds the
"tappable" layer on top.

### The manifest: `ski-routes.json`

A standard [TileJSON 3.0](https://github.com/mapbox/tilejson-spec) document that MapLibre reads
natively, plus two fields of our own:

| Field                 | Example                                                                               | Used by                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `tiles`               | `["https://tourenbuddy-data.pages.dev/ski-routes/2025-12-15T091422/{z}/{x}/{y}.pbf"]` | MapLibre; the app derives route-file URLs from it                                                       |
| `minzoom` / `maxzoom` | `11` / `13`                                                                           | MapLibre: no requests below 11, overzoom above 13                                                       |
| `bounds`              | `[6.78, 45.86, 10.55, 47.33]`                                                         | MapLibre: no requests outside                                                                           |
| `attribution`         | `© swisstopo`                                                                         | Map attribution (licence requirement); must match Swisstopo's string exactly or MapLibre shows it twice |
| `vector_layers`       | layer `routes` + field types                                                          | Documentation of the tile schema                                                                        |
| `version`             | `2025-12-15T091422`                                                                   | Workflow: "is this release already published?"                                                          |
| `count`               | `2941`                                                                                | Workflow: ±30% sanity check                                                                             |

The manifest is the only indirection. The app hard-codes one URL,
`https://tourenbuddy-data.pages.dev/ski-routes.json`, and everything else follows from it.

### Vector tiles: `{z}/{x}/{y}.pbf`

- **Format.** [Mapbox Vector Tile](https://github.com/mapbox/vector-tile-spec) (protobuf), one layer named
  `routes`. Geometry is stored as integers on a 4096 grid per tile, delta-encoded.
- **Zooms 11–13 only.** Below z11 nothing is marked, and the raster does the drawing. At z13 the grid is
  ≈0.8 m, finer than the data's own accuracy (metres). MapLibre overzooms z13 tiles to any deeper zoom
  without losing anything.
- **Sparse.** Only tiles that contain a route exist. Any other tile URL answers `404`, which MapLibre
  treats as an empty tile. The app's self-heal does **not** react to tile 404s.
- **Per-feature properties.** Only what marking and hit-testing need:

  | Property                                | Example             | Purpose                                                                               |
  | --------------------------------------- | ------------------- | ------------------------------------------------------------------------------------- |
  | `id`                                    | `"1020"`            | SAC route id (`sacid`), the key to the route file                                     |
  | `grade`                                 | `7`                 | Difficulty ordinal from the app's `skiDifficultyGrade`, which drives halo/badge color |
  | `difficulty_de` / `_fr` / `_it` / `_en` | `"ZS"` / `"AD"` / … | Badge text in the UI language                                                         |

- **Clipped.** A route crossing tile edges is cut into pieces, one per tile. A 16 px buffer around each
  tile makes the pieces overlap, so lines render seamlessly. The pieces are never used as "the route",
  see route files.
- **Sizes (2025 release).** z11 avg 5.1 KB (max 17 KB), z12 avg 2.3 KB, z13 avg 1.1 KB.

### Route files: `routes/<sacid>.json`

One GeoJSON Feature per route, holding the **complete, unclipped, unsimplified** geometry in WGS84 (6
decimals ≈ 0.1 m) and the attributes the trail card shows:

```json
{
  "type": "Feature",
  "id": "1020",
  "geometry": { "type": "MultiLineString", "coordinates": [[[7.755481, 46.550058], [7.755655, 46.549972]]] },
  "properties": {
    "target_name": "Bundstock",
    "target_altitude": 2756,
    "name": "Von Tschingel",
    "ascent_time_label": "05:00 h",
    "ascent_altitude": 1600,
    "descent_altitude": 1600,
    "difficulty_de": "ZS",
    "difficulty_fr": "AD"
  }
}
```

(Shortened: real files carry every vertex and `name_*`, `difficulty_*`, `url_sac_*` for de/fr/it/en.)

The shape is the same one the GeoAdmin `identify` API returned before. The app's existing Zod schema and
mapper (`mapSkiRoute`) read it unchanged. Average 5 KB raw, ≈2 KB with Brotli. It is fetched only when
a route is tapped.

_Why two formats:_ tiles are cheap to show everywhere, but they cut routes into pieces. The highlight,
the camera framing and future trail snapping need the whole line, and the route file provides it.

## How it is served

Cloudflare Pages serves the files from its CDN, with behavior configured by two text files the build
writes.

### `_headers`

```
/*                    Access-Control-Allow-Origin: *                      (app on another origin can fetch)
/ski-routes.json      Cache-Control: no-cache                             (always revalidate: it changes)
/ski-routes/*         Cache-Control: public, max-age=31536000, immutable  (versioned: never changes)
/ski-routes/*.pbf     Content-Type: application/x-protobuf
```

- **CORS.** The app runs on `touringbuddy.pages.dev` (and preview subdomains), the data on
  `tourenbuddy-data.pages.dev`. Without `Access-Control-Allow-Origin` the browser would block MapLibre's
  and the app's `fetch`es.
- **Compression.** Cloudflare compresses JSON (manifest, route files) with Brotli automatically, and
  tiles too, but only because of the `Content-Type` above: as `application/vnd.mapbox-vector-tile` they
  were served uncompressed. Measured 2026-10-16 on a dense z11 tile: 3,610 B compressed vs 8,154 B
  uncompressed (−56%). Keep `application/x-protobuf`; check with the runbook (Verifying a deploy).

### `_redirects`

When a new version is published, the build adds one line for the version it replaces:

```
/ski-routes/2025-12-15T091422/*  /ski-routes/2026-12-14T…/:splat  302
```

A deploy replaces the whole site, so the old version folder disappears. An app that is still running
with the old manifest keeps asking for old URLs. The redirect sends those to the same tile or route in
the new version. That works because tile addresses (`z/x/y`) and route ids (`sacid`) mean the same thing
in both versions. Only a route deleted in the new release answers `404`, and the app treats that as
"no route here" without showing an error.

Verified locally with `wrangler pages dev`: the `302` carries `Access-Control-Allow-Origin`, which a
cross-origin redirect needs. Production is checked at the first real version change (runbook).

## How the app consumes it

1. **Map style load.** `trail-layers.ts` adds a `vector` source whose `url` is the manifest. MapLibre
   fetches the manifest, then requests tiles for the visible area at z11–z13 and overzooms deeper.
2. **Drawing.** With the ski overlay on, from z11 a halo line layer (colored by `grade`) and a badge
   symbol layer (text from `difficulty_<lang>`) render the tiles' routes. Routes and tap targets come
   from the same tiles, so whatever is marked can be tapped.
3. **Tap.**
   1. `queryRenderedFeatures` around the tap returns tile pieces.
   2. They are de-duplicated by `id` and ranked by distance (`hitTest`, works offline).
   3. The app fetches `routes/<id>.json` for up to 8 candidates. The URL is derived from the manifest's
      `tiles` template, so tiles and route files always come from the same version.
   4. The card, highlight and framing use the full geometry.
4. **Version change while running (self-heal).** A route file `404` makes the app reload the manifest
   (`source.setUrl`), at most once per 10 minutes, and retry once. A tile failing with no HTTP status
   (blocked redirect) also triggers the reload. A tile `404` does not, because it just means "empty".

### Caching layers (outermost first)

| Layer                        | Manifest                                                                                                | Tiles / route files                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Cloudflare CDN               | Edge-cached, revalidated on deploy                                                                      | Edge-cached                                                                                                                          |
| Browser HTTP cache           | `no-cache`: always revalidated                                                                          | `immutable`: never revalidated                                                                                                       |
| Service worker (`src/sw.ts`) | `NetworkFirst` (3 s timeout) in its own `ski-route-manifest` cache: offline falls back to the last copy | Tiles: offline-region download first, then `CacheFirst`; route files: `CacheFirst`; both in `ski-route-data` (3000 entries, 30 days) |

Result: a tile or route file is downloaded once per device and version. Verified in a production build (2026-10-15):
after a reload, the service worker went to the network only for `ski-routes.json`. Old-version entries simply
expire from the service worker cache.

### Offline

- The offline-region download (`offline-tile-service.ts`) also stores the region's ski tiles (z11–z13)
  in `offline-map-tiles`, under a **version-less key** (`/ski-routes/<version>/` stripped).
- After a yearly refresh, tiles downloaded earlier still answer for the new version's URLs. They may be
  slightly stale, but routes stay visible offline.
- Route files are not downloaded, so tapping a route offline shows "Route details need a connection."

## Costs and limits

| Limit (Pages free)                    | Our usage                                                    |
| ------------------------------------- | ------------------------------------------------------------ |
| 20,000 files per deployment           | ≈5.6k                                                        |
| 25 MiB per file                       | largest file ≈ 26 KB                                         |
| Bandwidth / requests for static files | unmetered                                                    |
| 500 builds/month                      | not used: we upload prebuilt files (`wrangler pages deploy`) |

## Where things live

| What                                               | Where                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| Build script (gates, headers, redirects, manifest) | `scripts/ski-routes/build.ts`, tests `test/scripts/ski-routes/`                  |
| Scheduled job                                      | `.github/workflows/ski-route-data.yml`                                           |
| Ops runbook                                        | `docs/ski-route-data.md`                                                         |
| Map layers (source, halo, badges, highlight)       | `src/features/map/presentation/components/trail-layers.ts`, `ski-badge.ts`       |
| Tap lookup + self-heal                             | `src/features/map/presentation/composables/use-trail-lookup.ts`                  |
| Route-file fetch + mapping                         | `src/features/map/data/services/swisstopo-trail-service.ts`                      |
| Manifest URL                                       | `src/features/map/data/trail-overlays.ts` (`SKI_ROUTES_TILEJSON`)                |
| Service worker routes                              | `src/sw.ts`                                                                      |
| Offline download                                   | `src/features/map/data/services/offline-tile-service.ts`, `offline-map-cache.ts` |
