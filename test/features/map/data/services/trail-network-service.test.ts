import { stubGlobal } from '../../../../support/globals';
import { loadNetworkLines } from '@/features/map/data/services/trail-network-service';

// A tile's body is its layers as JSON; the fake reader hands them out as vector tile layers.
jest.mock('pbf', () => ({
  __esModule: true,
  default: class {
    buf: ArrayBuffer;
    constructor(buf: ArrayBuffer) {
      this.buf = buf;
    }
  },
}));
jest.mock('@mapbox/vector-tile', () => ({
  VectorTile: class {
    layers: Record<string, unknown>;
    constructor(pbf: { buf: ArrayBuffer }) {
      const layers = JSON.parse(new TextDecoder().decode(pbf.buf)) as Record<
        string,
        Record<string, unknown>[]
      >;
      this.layers = Object.fromEntries(
        Object.entries(layers).map(([name, features]) => [
          name,
          {
            length: features.length,
            extent: 4096,
            feature: (i: number) => ({
              type: 2,
              properties: features[i],
              loadGeometry: () => [
                [
                  { x: 0, y: 0 },
                  { x: 100, y: 0 },
                ],
              ],
            }),
          },
        ]),
      );
    }
  },
}));

const SKI = 'https://ski.test/{z}/{x}/{y}.pbf';
const BASE_TILE = {
  transportation: [
    { class: 'path', sac_scale: 'hiking' },
    { class: 'track' },
    { class: 'motorway' },
  ],
};
const SKI_TILE = { routes: [{}] };
const body = (layers: object) => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new TextEncoder().encode(JSON.stringify(layers)).buffer,
});

let skiFails = false;
const mockFetch = jest.fn(async (url: string) => {
  if (url.startsWith('https://ski.test')) {
    if (skiFails) throw new TypeError('offline');
    return body(SKI_TILE);
  }
  return body(BASE_TILE);
});

/** A box inside one zoom-13 tile, moved per test so the module's tile cache starts empty. */
const box = (n: number): [number, number, number, number] => [
  8.4 + n * 0.05,
  46.79,
  8.401 + n * 0.05,
  46.791,
];

describe('loadNetworkLines', () => {
  beforeEach(() => {
    skiFails = false;
    mockFetch.mockClear();
    stubGlobal('fetch', mockFetch);
  });

  it('should follow every road, forest road and path alike with no layer shown, never a motorway or the ski tiles', async () => {
    const { lines } = await loadNetworkLines(null, box(0), SKI);
    expect(lines.map((l) => l.cost)).toEqual([1, 1]);
    expect(mockFetch.mock.calls.every(([url]) => !url.startsWith('https://ski.test'))).toBe(true);
  });

  it('should keep to the marked trails with hiking shown and fall back on the other ways', async () => {
    const { lines } = await loadNetworkLines('hiking', box(1), SKI);
    expect(lines.map((l) => l.cost)).toEqual([1, 1.5]);
  });

  it('should put the ski routes first in ski mode, every base way after them, trails included', async () => {
    const { lines } = await loadNetworkLines('ski', box(2), SKI);
    expect(lines.map((l) => l.cost)).toEqual([1.5, 1.5, 1]);
    // Only the ski routes reach 20 m across to meet another line.
    expect(lines.map((l) => l.join != null)).toEqual([false, false, true]);
  });

  it("should still give the roads and paths when the ski tiles can't load", async () => {
    skiFails = true;
    const { lines } = await loadNetworkLines('ski', box(3), SKI);
    expect(lines).toHaveLength(2);
  });
});
