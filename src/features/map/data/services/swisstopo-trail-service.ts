import type { LngLat, SkiRouteInfo, Trail } from '@/features/map/domain/entities/trail';
import { z } from 'zod';

// One route file is a few KB; still give slow mountain connections room.
const TIMEOUT_MS = 8000;

const position = z.tuple([z.number(), z.number()]).rest(z.number());
// Swisstopo mixes numbers and numeric strings ("780") across these fields.
const num = z.union([z.number(), z.string()]).nullish();
const str = z.string().nullish();

const featureSchema = z.object({
  id: z.union([z.string(), z.number()]),
  geometry: z.discriminatedUnion('type', [
    z.object({ type: z.literal('LineString'), coordinates: z.array(position) }),
    z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(position)) }),
  ]),
  properties: z.record(z.string(), z.unknown()),
});

const propsSchema = z
  .object({
    target_name: str,
    target_altitude: num,
    name: str,
    ascent_time_label: str,
    ascent_altitude: num,
    descent_altitude: num,
  })
  .passthrough();

type Feature = z.infer<typeof featureSchema>;

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Swisstopo localizes as `<field>_<de|fr|it|en>`; missing translations fall back to `fallback`. */
function localized(
  props: Record<string, unknown>,
  field: string,
  lang: string,
  fallback?: string | null,
) {
  const value = props[`${field}_${lang}`];
  return typeof value === 'string' && value ? value : (fallback ?? null);
}

export function mapSkiRoute(feature: Feature, lang: string): Trail {
  const { geometry } = feature;
  const parts = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const lines = parts.map((line) => line.map(([lng, lat]) => [lng, lat] as LngLat));

  const p = propsSchema.parse(feature.properties);
  const route: SkiRouteInfo | null =
    p.target_name == null
      ? null
      : {
          name: localized(p, 'name', lang, p.name),
          targetName: p.target_name,
          targetAltitude: toNumber(p.target_altitude),
          difficulty: localized(p, 'difficulty', lang, localized(p, 'difficulty', 'de')),
          ascentTime: p.ascent_time_label ?? null,
          ascentM: toNumber(p.ascent_altitude),
          descentM: toNumber(p.descent_altitude),
          sacUrl: localized(p, 'url_sac', lang, localized(p, 'url_sac', 'de')),
        };
  return { overlay: 'ski', id: String(feature.id), lines, route };
}

export interface FetchRouteParams {
  /** The route file URL (derived from the loaded TileJSON, so it matches the tiles' version). */
  url: string;
  /** UI locale, e.g. `de-CH` or `en`. */
  locale: string;
  signal: AbortSignal;
}

/** The route file doesn't exist: the dataset moved to a new version, or the route was removed. */
export class SkiRouteNotFoundError extends Error {}

/**
 * One ski route with its complete geometry, from the self-hosted dataset
 * (docs/ski-route-hosting.md). Rejects on network/HTTP/validation failure, timeout
 * and abort; a 404 rejects with `SkiRouteNotFoundError`.
 */
export async function fetchSkiRoute({ url, locale, signal }: FetchRouteParams): Promise<Trail> {
  // ponytail: manual link instead of AbortSignal.any (iOS < 17.4 lacks it).
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort);
  const timer = setTimeout(abort, TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (response.status === 404) throw new SkiRouteNotFoundError(url);
    if (!response.ok) throw new Error(`Ski route HTTP ${response.status}`);
    return mapSkiRoute(featureSchema.parse(await response.json()), locale.split('-')[0]!);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}
