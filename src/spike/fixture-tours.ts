import { BUCKET_COLORS, PIE_PREFIX } from './marker-images';

/** Deterministic PRNG (mulberry32): the same 1,000 tours on every run and device. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UNTYPED = BUCKET_COLORS.length - 1;

/**
 * `count` tours over the Swiss Alps, denser around a few hubs like real data. Each tour weighs 1,
 * split evenly across its colour buckets (`w0`…`w6`), which the clusters sum (`clusterProperties`).
 */
export function fixtureTours(count = 1000): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const random = rng(346);
  const hubs: [number, number][] = [[7.75, 46.02], [7.45, 46.0], [8.0, 46.55], [9.85, 46.5], [7.1, 46.1], [8.6, 46.65]];
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (let i = 0; i < count; i++) {
    const nearHub = random() < 0.6;
    const [hx, hy] = hubs[Math.floor(random() * hubs.length)]!;
    const lng = nearHub ? hx + (random() - 0.5) * 0.5 : 6.8 + random() * 3.6;
    const lat = nearHub ? hy + (random() - 0.5) * 0.3 : 45.9 + random() * 1.0;
    const roll = random();
    const buckets = roll < 0.03
      ? [UNTYPED]
      : [...new Set(Array.from({ length: roll > 0.8 ? 2 : 1 }, () => Math.floor(random() * UNTYPED)))];
    const weights = BUCKET_COLORS.map((_, b) => (buckets.includes(b) ? 1 / buckets.length : 0));
    features.push({
      type: 'Feature',
      id: i,
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        name: `Tour ${i + 1}`,
        color: BUCKET_COLORS[buckets[0]!],
        ...(buckets.length > 1 && { pie: PIE_PREFIX + weights.map(w => (w ? 1 : 0)).join(',') }),
        ...Object.fromEntries(weights.map((w, b) => [`w${b}`, w])),
      },
    });
  }
  return { type: 'FeatureCollection', features };
}
