# Ski-route data

Runbook for the app's own copy of the Swisstopo ski-route dataset (#326, OpenSpec change
`self-hosted-ski-routes`). Read this when the data job fails or when ski routes look stale.
How the data is stored and served (formats, headers, caching): `docs/ski-route-hosting.md`.

## What runs where

- **Source:** Swisstopo GeoPackage `skitouren_2056.gpkg.zip`, found via the STAC collection
  `ch.swisstopo-karto.skitouren`. Released about once a year, mid-December. Licence: swisstopo free
  geodata terms, attribution `©swisstopo` mandatory.
- **Job:** `.github/workflows/ski-route-data.yml`.
  - Runs weekly (Monday 04:17 UTC) and on manual dispatch.
  - Compares the asset's STAC `updated` timestamp with `version` in the published manifest. If they
    differ, it rebuilds with `scripts/ski-routes/build.ts` (GDAL `ogr2ogr` + `tippecanoe`).
- **Host:** Cloudflare Pages project `tourenbuddy-data` → `https://tourenbuddy-data.pages.dev`.
  - Separate from the app: the data updates even if the app gets no releases.
  - Deployed by the job with the repo secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.
- **Contents:** only routes with route info (`target_name` set, source `swisstopo_sac`), keyed by
  SAC route id `sacid`.

  ```
  /ski-routes.json                         TileJSON manifest: version, count, tiles template
  /ski-routes/<version>/{z}/{x}/{y}.pbf    vector tiles z11–z13, layer `routes`
  /ski-routes/<version>/routes/<sacid>.json  full geometry + attributes per route
  /_headers  /_redirects                   CORS + caching; old version → new version (302)
  ```

## When the job fails

Nothing is deployed when the job fails. The previous version stays live, so the app keeps working on
older data. GitHub emails the failure to whoever last changed the workflow's `cron` line.

| Error in the log                                      | Meaning                                           | Action                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Route count N drifts more than 30% from published M` | Heuristic: the release changed a lot              | Check the new release looks sane (e.g. on map.geo.admin.ch). If real: **Actions → Ski-route data → Run workflow → force** |
| `Route without sacid` / `Duplicate sacid`             | Swisstopo changed the data model                  | Fix `build.ts`. The app relies on `sacid` being a stable, unique id. `force` does **not** skip this                       |
| `Tile at zN is … B` / `No tiles at zN`                | Broken build (tippecanoe flags, geometry)         | Fix `build.ts`. Not skippable                                                                                             |
| `Route files do not match the tiled routes`           | Disk or write problem                             | Re-run, then investigate                                                                                                  |
| `Unexpected STAC version` / asset not found           | Swisstopo renamed the asset or changed STAC       | Update the `jq` selector in the workflow                                                                                  |
| `ogr2ogr` error about layer/columns                   | GeoPackage layer or column renamed                | Update the layer name / `-where` in `build.ts`                                                                            |
| Wrangler auth error                                   | Cloudflare token expired or lost Pages permission | Renew `CLOUDFLARE_API_TOKEN` (the app deploy needs it too)                                                                |

## Workflow disabled

GitHub disables scheduled workflows in public repos after 60 days without repo activity. Every run
calls `gh workflow enable` on itself to reset that timer. Whether this works is unverified.

- **Check:** `gh api repos/sekael/tourenbuddy_frontend_vue/actions/workflows/ski-route-data.yml --jq .state`
  should print `active`.
- **If it prints `disabled_inactivity`:** re-enable it (Actions tab → _Enable workflow_, or
  `gh workflow enable ski-route-data.yml`). The self-enable didn't reset the timer, so switch the
  keepalive to a bot commit as repo activity, and record the outcome below.
- **Rejected alternative:** a Worker cron firing `repository_dispatch`. It needs a GitHub token in
  Worker secrets, and that token expires, which is a hidden recurring manual task.

Verification log:

- _pending_: state ~2 months after the first merge.

## Verifying a deploy

```bash
curl -s https://tourenbuddy-data.pages.dev/ski-routes.json | jq '{version, count, tiles}'
curl -sI -H 'Origin: https://touringbuddy.pages.dev' \
  "https://tourenbuddy-data.pages.dev/ski-routes/<version>/13/4285/2884.pbf" | grep -i 'access-control\|content-type\|cache-control'
curl -s "https://tourenbuddy-data.pages.dev/ski-routes/<version>/routes/1020.json" | jq '.properties.target_name'
# Tile compression: with Accept-Encoding the transfer must be clearly smaller (curl counts wire bytes)
T="https://tourenbuddy-data.pages.dev/ski-routes/<version>/11/1068/724.pbf"
curl -s -o /dev/null -w '%{size_download}\n' -H 'Accept-Encoding: br, gzip' "$T"; curl -s -o /dev/null -w '%{size_download}\n' "$T"
```

- 2026-10-16 (forced run after #330): tiles compressed, 3,610 B vs 8,154 B for z11 tile `11/1068/724`.

After a version change, an old-version URL must answer `302` **with** `Access-Control-Allow-Origin`.
Without that header, browsers block the redirect cross-origin, and the app's manifest reload (design
D9) has to cover it alone.

- _pending_: result of the 302 + CORS check.

## Running the build locally

```bash
# needs gdal-bin + tippecanoe (≥ 2.49)
curl -fsSL https://data.geo.admin.ch/ch.swisstopo-karto.skitouren/skitouren/skitouren_2056.gpkg.zip -o /tmp/ski.zip
unzip -q /tmp/ski.zip -d /tmp/ski
npx tsx scripts/ski-routes/build.ts --gpkg /tmp/ski/ski_routes_2056.gpkg --version local \
  --out /tmp/ski-out --base http://localhost:8788
```

The build logs average and maximum tile size per zoom. The 2025-12-15 release gave 2,941 routes,
5.6k files, and z13 tiles averaging ≈1 KB.
