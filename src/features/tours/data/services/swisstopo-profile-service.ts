import type { LngLat } from '@/features/map/domain/entities/trail';
import { z } from 'zod';
import { createLogger } from '@/core/logging/logger';
import { haversineMeters } from '@/core/utils/haversine';
import { wgs84ToLv95 } from '@/core/utils/wgs84-to-lv95';

const logger = createLogger('SwisstopoProfile');
const PROFILE_URL = 'https://api3.geo.admin.ch/rest/services/profile.json?sr=2056';
const TIMEOUT_MS = 10_000;
/** Points every this many metres at most, so a straight leg over a ridge still climbs it. */
const STEP_M = 25;

const profileSchema = z.array(
  z.object({
    dist: z.number(),
    alts: z.object({ COMB: z.number().nullish() }),
  }),
);

/** A line with a height per point (null where the terrain model has none). */
export interface ProfiledLine {
  line: LngLat[];
  heights: (number | null)[];
}

/** `line` with points added so no stretch is longer than `step` metres. */
export function densify(line: readonly LngLat[], step = STEP_M): LngLat[] {
  return line.flatMap((p, i) => {
    if (i === 0) return [p];
    const a = line[i - 1]!;
    const n = Math.max(1, Math.ceil(haversineMeters(a, p) / step));
    return Array.from({ length: n }, (_, k) => {
      const t = (k + 1) / n;
      return t === 1 ? p : ([a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t] as LngLat);
    });
  });
}

/** Heights at `distances` (metres along the line), read off the profile's own stations. */
function heightsAt(distances: number[], profile: z.infer<typeof profileSchema>): (number | null)[] {
  const total = distances.at(-1)!;
  const span = profile.at(-1)!.dist;
  let j = 0;
  return distances.map((d) => {
    // Both measure the same line (LV95 vs. great circle): compare as shares of its length.
    const at = total > 0 ? (d / total) * span : 0;
    while (j < profile.length - 2 && profile[j + 1]!.dist < at) j++;
    const [a, b] = [profile[j]!, profile[Math.min(j + 1, profile.length - 1)]!];
    const [ha, hb] = [a.alts.COMB, b.alts.COMB];
    if (ha == null || hb == null) return ha ?? hb ?? null;
    const t = b.dist > a.dist ? Math.max(0, Math.min(1, (at - a.dist) / (b.dist - a.dist))) : 0;
    return Math.round((ha + (hb - ha) * t) * 10) / 10;
  });
}

const recent = new Map<string, Promise<ProfiledLine | null>>();

/**
 * The line, densified, with its terrain heights from swisstopo's profile service (DTM2/DTM25).
 * Null when the service can't be reached or times out. Answers are shared: the drawing's live
 * numbers and the saved track ask once — so a request is never aborted by one caller leaving.
 */
export function getTrackProfile(line: readonly LngLat[]): Promise<ProfiledLine | null> {
  if (line.length < 2) return Promise.resolve(null);
  const key = line.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';');
  const known = recent.get(key);
  if (known) return known;
  const pending = fetchProfile(densify(line));
  recent.set(key, pending);
  // Only answers are worth keeping; a failure asks again next time.
  void pending.then((result) => result ?? recent.delete(key));
  if (recent.size > 6) recent.delete(recent.keys().next().value!);
  return pending;
}

async function fetchProfile(line: LngLat[]): Promise<ProfiledLine | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const coordinates = line.map(([lng, lat]) => {
      const { easting, northing } = wgs84ToLv95(lng, lat);
      return [Math.round(easting * 10) / 10, Math.round(northing * 10) / 10];
    });
    const response = await fetch(`${PROFILE_URL}&nb_points=${line.length}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'LineString', coordinates }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Profile HTTP ${response.status}`);
    const profile = profileSchema.parse(await response.json());
    if (profile.length < 2) return null;
    let walked = 0;
    const distances = line.map((p, i) => (walked += i > 0 ? haversineMeters(line[i - 1]!, p) : 0));
    return { line, heights: heightsAt(distances, profile) };
  } catch (err) {
    logger.warn('Swisstopo profile failed', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
