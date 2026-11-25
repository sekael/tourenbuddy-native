/**
 * Builds the self-hosted ski-route dataset (OpenSpec change `self-hosted-ski-routes`, D1–D4, D9)
 * from Swisstopo's GeoPackage: vector tiles (z11–z13) + one full-geometry GeoJSON file per route,
 * plus the TileJSON manifest and the Cloudflare Pages `_headers` / `_redirects`.
 *
 *   tsx scripts/ski-routes/build.ts --gpkg ski_routes_2056.gpkg --version <v> --out out \
 *     --base https://tourenbuddy-data.pages.dev [--previous previous.json] [--force]
 *
 * Needs `ogr2ogr` (GDAL) and `tippecanoe` on PATH. Runbook: docs/ski-route-data.md.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { skiDifficultyGrade } from '../../src/features/map/domain/ski-difficulty'

export const MIN_ZOOM = 11
export const MAX_ZOOM = 13
/** A z13 tile averages ≈2 KB; anything near this means a broken build. */
export const MAX_TILE_BYTES = 50_000
/** Allowed route-count change vs. the published version (skipped with --force). */
export const MAX_COUNT_DRIFT = 0.3
const LANGS = ['de', 'fr', 'it', 'en'] as const
/** The fields the trail card reads (`mapSkiRoute`); everything else is dropped. */
const ROUTE_FIELDS = [
  'target_name',
  'target_altitude',
  'name',
  'ascent_time_label',
  'ascent_altitude',
  'descent_altitude',
  ...LANGS.flatMap(l => [`name_${l}`, `difficulty_${l}`, `url_sac_${l}`]),
]

type Props = Record<string, unknown>
interface Feature { type: 'Feature', geometry: { type: string, coordinates: unknown }, properties: Props }
export interface Manifest { version: string, count: number }

/** Throws on the checks that are always bugs; returns the count-drift problem (skippable) separately. */
export function checkRoutes(ids: unknown[], count: number, previous: Manifest | null): string | null {
  const seen = new Set<string>()
  for (const id of ids) {
    if (id == null || id === '')
      throw new Error('Route without sacid')
    if (seen.has(String(id)))
      throw new Error(`Duplicate sacid ${id}`)
    seen.add(String(id))
  }
  if (count === 0)
    throw new Error('No routes')
  if (previous && Math.abs(count - previous.count) / previous.count > MAX_COUNT_DRIFT)
    return `Route count ${count} drifts more than ${MAX_COUNT_DRIFT * 100}% from published ${previous.count}`
  return null
}

/** Per-zoom tile stats; throws if any tile exceeds `MAX_TILE_BYTES`. */
export function checkTiles(sizes: { zoom: number, bytes: number }[]): string[] {
  const lines: string[] = []
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const zs = sizes.filter(s => s.zoom === z).map(s => s.bytes)
    if (zs.length === 0)
      throw new Error(`No tiles at z${z}`)
    const max = Math.max(...zs)
    lines.push(`z${z}: ${zs.length} tiles, avg ${Math.round(zs.reduce((a, b) => a + b, 0) / zs.length)} B, max ${max} B`)
    if (max > MAX_TILE_BYTES)
      throw new Error(`Tile at z${z} is ${max} B (> ${MAX_TILE_BYTES})`)
  }
  return lines
}

export function pagesHeaders(): string {
  return [
    '/*',
    '  Access-Control-Allow-Origin: *',
    '/ski-routes.json',
    '  Cache-Control: no-cache',
    '/ski-routes/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/ski-routes/*.pbf',
    // Cloudflare leaves application/vnd.mapbox-vector-tile uncompressed (measured); x-protobuf is the
    // other common tile type. MapLibre ignores the content type either way.
    '  Content-Type: application/x-protobuf',
    '',
  ].join('\n')
}

/** Old-version paths answer with the same tile / route of the new version (D9). */
export function pagesRedirects(version: string, previous: Manifest | null): string {
  return previous && previous.version !== version
    ? `/ski-routes/${previous.version}/*  /ski-routes/${version}/:splat  302\n`
    : ''
}

function bounds(features: Feature[]): [number, number, number, number] {
  const b: [number, number, number, number] = [180, 90, -180, -90]
  const visit = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === 'number') {
      const [x, y] = c as [number, number]
      b[0] = Math.min(b[0], x)
      b[1] = Math.min(b[1], y)
      b[2] = Math.max(b[2], x)
      b[3] = Math.max(b[3], y)
    }
    else if (Array.isArray(c)) {
      c.forEach(visit)
    }
  }
  features.forEach(f => visit(f.geometry.coordinates))
  return b.map(v => Math.round(v * 1e4) / 1e4) as [number, number, number, number]
}

function listTiles(dir: string): { zoom: number, bytes: number }[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(p => p.endsWith('.pbf'))
    .map(p => ({ zoom: Number(p.split(/[/\\]/)[0]), bytes: statSync(join(dir, p)).size }))
}

function main() {
  const { values: a } = parseArgs({
    options: {
      gpkg: { type: 'string' },
      version: { type: 'string' },
      out: { type: 'string' },
      base: { type: 'string' },
      previous: { type: 'string' },
      force: { type: 'boolean', default: false },
    },
  })
  if (!a.gpkg || !a.version || !a.out || !a.base)
    throw new Error('Usage: --gpkg <file> --version <v> --out <dir> --base <url> [--previous <json>] [--force]')
  if (!/^[\w-]+$/.test(a.version))
    throw new Error(`Unsafe version "${a.version}"`)
  const previous: Manifest | null = a.previous ? JSON.parse(readFileSync(a.previous, 'utf8')) : null

  const tmp = mkdtempSync(join(tmpdir(), 'ski-routes-'))
  const seq = join(tmp, 'routes.geojsonseq')
  // Only routes with route info, only swisstopo/SAC lines (third-party sources never carry info anyway).
  execFileSync('ogr2ogr', [
    '-f',
    'GeoJSONSeq',
    seq,
    a.gpkg,
    'ski_routes_2056',
    '-t_srs',
    'EPSG:4326',
    '-dim',
    'XY',
    '-lco',
    'COORDINATE_PRECISION=6',
    '-where',
    `target_name IS NOT NULL AND source = 'swisstopo_sac'`,
  ], { stdio: 'inherit' })
  const features: Feature[] = readFileSync(seq, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))

  const driftProblem = checkRoutes(features.map(f => f.properties.sacid), features.length, previous)
  if (driftProblem && !a.force)
    throw new Error(`${driftProblem}. If the change is real, re-run with force (docs/ski-route-data.md).`)
  if (driftProblem)
    console.warn(`${driftProblem} — continuing (--force).`)

  // Tiles carry only what marking and hit-testing need (D2).
  const tileInput = join(tmp, 'tiles.geojsonseq')
  writeFileSync(tileInput, features.map((f) => {
    const p = f.properties
    const props: Props = { id: String(p.sacid), grade: skiDifficultyGrade((p.difficulty_de as string | null) ?? null) }
    for (const l of LANGS)
      props[`difficulty_${l}`] = p[`difficulty_${l}`] ?? null
    return JSON.stringify({ type: 'Feature', geometry: f.geometry, properties: props })
  }).join('\n'))

  const versionDir = join(a.out, 'ski-routes', a.version)
  rmSync(a.out, { recursive: true, force: true })
  // tippecanoe creates only the last path segment.
  mkdirSync(join(a.out, 'ski-routes'), { recursive: true })
  execFileSync('tippecanoe', [
    '-e',
    versionDir,
    '-l',
    'routes',
    `-Z${MIN_ZOOM}`,
    `-z${MAX_ZOOM}`,
    // Wider than the halo (10 px + blur) so lines join seamlessly across tile edges.
    '--buffer=16',
    '--no-feature-limit',
    '--no-tile-size-limit',
    '--no-simplification-of-shared-nodes',
    // Pages compresses on the fly; pre-gzipped tiles would need a Content-Encoding header.
    '--no-tile-compression',
    '--force',
    '--quiet',
    tileInput,
  ], { stdio: 'inherit' })
  rmSync(join(versionDir, 'metadata.json'), { force: true })
  for (const line of checkTiles(listTiles(versionDir)))
    process.stdout.write(`${line}\n`)

  const routesDir = join(versionDir, 'routes')
  mkdirSync(routesDir, { recursive: true })
  for (const f of features) {
    const properties: Props = {}
    for (const k of ROUTE_FIELDS)
      properties[k] = f.properties[k] ?? null
    const id = String(f.properties.sacid)
    writeFileSync(join(routesDir, `${id}.json`), JSON.stringify({ type: 'Feature', id, geometry: f.geometry, properties }))
  }
  if (readdirSync(routesDir).length !== features.length)
    throw new Error('Route files do not match the tiled routes')

  writeFileSync(join(a.out, 'ski-routes.json'), JSON.stringify({
    tilejson: '3.0.0',
    name: 'TourenBuddy ski routes',
    version: a.version,
    count: features.length,
    // Exactly Swisstopo's own string (base map, Classic, overlays): MapLibre merges
    // identical attributions only, so '©swisstopo' would show a second credit.
    attribution: '© swisstopo',
    minzoom: MIN_ZOOM,
    maxzoom: MAX_ZOOM,
    bounds: bounds(features),
    tiles: [`${a.base}/ski-routes/${a.version}/{z}/{x}/{y}.pbf`],
    vector_layers: [{ id: 'routes', fields: { id: 'String', grade: 'Number', difficulty_de: 'String', difficulty_fr: 'String', difficulty_it: 'String', difficulty_en: 'String' } }],
  }, null, 2))
  writeFileSync(join(a.out, '_headers'), pagesHeaders())
  writeFileSync(join(a.out, '_redirects'), pagesRedirects(a.version, previous))
  rmSync(tmp, { recursive: true, force: true })
  process.stdout.write(`Built ${features.length} routes, version ${a.version}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main()
