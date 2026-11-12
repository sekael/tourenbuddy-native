import { z } from 'zod';
import { createLogger } from '@/core/logging/logger';
import { haversineMeters } from '@/core/utils/haversine';

const logger = createLogger('SwisstopoSearch');
const TIMEOUT_MS = 5000;
const CANDIDATES = 30;
const SHOWN = 8;
/** From this zoom on, the view says where the user means; below it, it doesn't. */
const PROXIMITY_MIN_ZOOM = 9;

/** GeoAdmin `zoomlevel` is on swisstopo's LV95 scale, so zoom comes from the origin. */
const ORIGIN_ZOOM: Record<string, number> = {
  gazetteer: 14,
  address: 17,
  zipcode: 12,
  gg25: 12,
};
const DEFAULT_ZOOM = 13;
const STOP_ZOOM = 16;
/** Stops asked for next to the place search when picking a start or end (design D1). */
const STOPS = 5;
/** A stop this close to a same-named place is the same spot. */
const SAME_SPOT_M = 150;

/** What the picker is choosing; a start or end point ranks access places first (design D1). */
export type PickRole = 'goal' | 'start' | 'end';

export interface LocationResult {
  name: string;
  /** Source object kind ("Alpiner Gipfel"); null for postcodes, municipalities, addresses, stops. */
  kind: string | null;
  /** "Pontresina (GR)" */
  region: string | null;
  /** GeoAdmin origin (`gazetteer`, `address`, …), or `stop` for a public-transport stop. */
  origin: string;
  /** swissTLM3D class (`TLM_SIEDLUNGSNAME`, …): language-independent, unlike `kind`. */
  objectclass: string | null;
  lng: number;
  lat: number;
  zoom: number;
}

const entrySchema = z.object({
  attrs: z.object({
    label: z.string(),
    lat: z.number(),
    lon: z.number(),
    origin: z.string(),
    objectclass: z.string().optional(),
  }),
});
const responseSchema = z.object({ results: z.array(z.unknown()) });

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Markup to plain text: tags dropped (never rendered or run), entities decoded. */
function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity;
      const point =
        code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    });
}

/**
 * Splits a GeoAdmin label into plain-text parts. Labels are HTML
 * (`<i>Alpiner Gipfel</i> <b>Piz Bernina</b> (GR) - Pontresina`, addresses put the street
 * before the bold locality). React Native has no HTML parser, and the labels only ever use `<i>`
 * and `<b>` around text, so the parts are cut by those tags and the rest stripped as text.
 */
export function parseLabel(label: string): Pick<LocationResult, 'name' | 'kind' | 'region'> {
  const squash = (text: string) => text.replace(/\s+/g, ' ').trim();
  const italic = /<i>([\s\S]*?)<\/i>/i.exec(label);
  const kind = italic ? squash(plain(italic[1]!)) || null : null;
  const rest = italic ? label.replace(italic[0], '') : label;
  const bold = /<b>([\s\S]*?)<\/b>/i.exec(rest);

  const before = bold ? plain(rest.slice(0, bold.index)) : '';
  const after = bold ? plain(rest.slice(bold.index + bold[0].length)) : '';
  // Addresses: "Via Pros da God # <b>7504 Pontresina</b>" — drop the stray "#".
  const street = squash(before.replace(/#/g, ''));
  const main = squash(plain(bold ? bold[1]! : rest));
  const name = street ? `${street}, ${main}` : main;

  // Whitespace-normalized, so the separator is exactly " - " (no backtracking-prone \s*).
  const tail = squash(after);
  const match = /^\(([^)]+)\) - (.+)$/.exec(tail);
  const region = match ? `${match[2]} (${match[1]})` : tail || null;
  return { name, kind, region };
}

const UMLAUTS: Record<string, string> = { ae: 'ä', oe: 'ö', ue: 'ü' };

/**
 * GeoAdmin spells most German kinds without umlauts ("Gebaeude", "Huegel"; names keep
 * theirs). "ue" after q, a or e is a real "ue" (Quelle, Mauer, Feuer).
 * ponytail: a rule, not a dictionary; a real "ue" after a consonant ("Duell") would
 * become "ü" — no swissNAMES3D kind has one.
 */
export function restoreUmlauts(text: string): string {
  return text.replace(/(?<![qae])ue|ae|oe/gi, (m) => {
    const u = UMLAUTS[m.toLowerCase()]!;
    return m[0] === m[0]!.toUpperCase() ? u.toUpperCase() : u;
  });
}

async function fetchResults(params: URLSearchParams, signal: AbortSignal): Promise<unknown[]> {
  const response = await fetch(
    `https://api3.geo.admin.ch/rest/services/api/SearchServer?${params}`,
    { signal },
  );
  if (!response.ok) throw new Error(`Location search HTTP ${response.status}`);
  return responseSchema.parse(await response.json()).results;
}

/**
 * Searches Swiss place names, summits, huts, localities, postcodes and addresses
 * (GeoAdmin SearchServer) — for a start or end point also public-transport stops, whose
 * failure never fails the search. Malformed entries are dropped. Rejects on HTTP/validation
 * failure; a timeout rejects with a `TimeoutError` DOMException, an abort through
 * `signal` with the fetch's own `AbortError` — so callers can stay silent on the latter.
 */
export async function searchLocations(
  query: string,
  lang: string,
  signal: AbortSignal,
  role: PickRole = 'goal',
): Promise<LocationResult[]> {
  const params = new URLSearchParams({
    type: 'locations',
    searchText: query,
    sr: '4326',
    limit: String(CANDIDATES),
    lang: lang.split('-')[0]!,
    origins: 'gazetteer,zipcode,gg25,address',
  });
  const stopParams = new URLSearchParams({
    type: 'featuresearch',
    features: 'ch.bav.haltestellen-oev',
    searchText: query,
    sr: '4326',
    limit: String(STOPS),
  });
  // ponytail: manual link instead of AbortSignal.any (iOS < 17.4 lacks it).
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  try {
    const stopsRequest =
      role === 'goal'
        ? Promise.resolve([])
        : fetchResults(stopParams, controller.signal).catch((err: unknown) => {
            logger.warn('Stop search failed', err);
            return [];
          });
    const [results, stopResults] = await Promise.all([
      fetchResults(params, controller.signal),
      stopsRequest,
    ]);
    const places = results.flatMap((raw): LocationResult[] => {
      const entry = entrySchema.safeParse(raw);
      if (!entry.success) return [];
      const { label, lat, lon, origin, objectclass } = entry.data.attrs;
      const parts = parseLabel(label);
      if (!parts.name) return [];
      if (parts.kind && params.get('lang') === 'de') parts.kind = restoreUmlauts(parts.kind);
      return [
        {
          ...parts,
          origin,
          objectclass: objectclass ?? null,
          lng: lon,
          lat,
          zoom: ORIGIN_ZOOM[origin] ?? DEFAULT_ZOOM,
        },
      ];
    });
    const stops = stopResults.flatMap((raw): LocationResult[] => {
      const entry = entrySchema.safeParse(raw);
      if (!entry.success) return [];
      const { label, lat, lon } = entry.data.attrs;
      const stop = {
        name: label.trim(),
        kind: null,
        region: null,
        origin: 'stop',
        objectclass: null,
        lng: lon,
        lat,
        zoom: STOP_ZOOM,
      };
      const known = places.some(
        (p) =>
          p.name === stop.name &&
          haversineMeters([p.lng, p.lat], [stop.lng, stop.lat]) < SAME_SPOT_M,
      );
      return stop.name && !known ? [stop] : [];
    });
    return [...places, ...stops];
  } catch (err) {
    if (timedOut) {
      logger.warn('Location search timed out', { query });
      throw new DOMException('Location search timed out', 'TimeoutError');
    }
    throw err;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

/**
 * How well a place serves as a start or end point (design D1), lower first: stops, stations
 * and cable cars; villages, buildings (huts, hotels), municipalities and postcodes; everything
 * else, including summits and passes; house addresses ("Steingletscher 365c", rarely meant);
 * terrain (glaciers, ridges).
 */
export function accessClass(r: LocationResult): number {
  const cls = r.objectclass?.toUpperCase();
  if (r.origin === 'stop' || cls === 'TLM_HALTESTELLE') return 0;
  if (
    cls === 'TLM_SIEDLUNGSNAME' ||
    cls === 'TLM_GEBAEUDE' ||
    r.origin === 'gg25' ||
    r.origin === 'zipcode'
  )
    return 1;
  if (r.origin === 'address') return 3;
  return cls === 'TLM_GELAENDENAME' ? 4 : 2;
}

/**
 * Orders candidates for display and keeps the first 8. Keeps the service's order — for a
 * start or end point grouped by `accessClass` first — and from zoom 9 on lists each set of
 * identically named places (of one class) nearest-first at the position of its first member —
 * "Schwarzhorn" near the view wins, other names never move.
 */
export function rankResults(
  results: LocationResult[],
  center: { lng: number; lat: number },
  zoom: number,
  role: PickRole = 'goal',
): LocationResult[] {
  const cls = role === 'goal' ? () => 0 : accessClass;
  // Array#sort is stable: within a class the service's order stays.
  const ordered = [...results].sort((a, b) => cls(a) - cls(b));
  if (zoom < PROXIMITY_MIN_ZOOM) return ordered.slice(0, SHOWN);
  // ponytail: equirectangular distance — only the order matters, and only within Switzerland.
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const dist = (r: LocationResult) => ((r.lng - center.lng) * cos) ** 2 + (r.lat - center.lat) ** 2;
  // Grouped by name within a class: for a start, a same-named glacier still falls behind huts.
  const groups = new Map<string, LocationResult[]>();
  for (const r of ordered) {
    const key = `${cls(r)}:${r.name}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()]
    .flatMap((group) => group.sort((a, b) => dist(a) - dist(b)))
    .slice(0, SHOWN);
}
