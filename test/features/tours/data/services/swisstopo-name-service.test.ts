import * as lv95 from '@/core/utils/wgs84-to-lv95';
import { stubGlobal, unstubAllGlobals } from '../../../../support/globals';
import {
  suggestAreaName,
  suggestTourName,
} from '@/features/tours/data/services/swisstopo-name-service';

function makeIdentifyResponse(results: object[]): Response {
  return new Response(JSON.stringify({ results }), { status: 200 });
}

/** A fetch that only settles when its signal aborts — a Swisstopo that never answers. */
function hangingFetch() {
  jest.mocked(fetch).mockImplementationOnce(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        );
      }),
  );
}

describe('suggestTourName', () => {
  beforeEach(() => {
    stubGlobal('fetch', jest.fn());
  });

  afterEach(() => {
    unstubAllGlobals();
  });

  it('should return the feature name when found within 50 m', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        makeIdentifyResponse([{ attributes: { name: 'Rigi Kulm', objektart: 'Alpiner Gipfel' } }]),
      );

    const result = await suggestTourName({ lng: 8.4845, lat: 47.0564 });
    expect(result).toBe('Rigi Kulm');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('should fall back to 500 m search when 50 m returns no results', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(makeIdentifyResponse([]))
      .mockResolvedValueOnce(
        makeIdentifyResponse([{ attributes: { name: 'Matterhorn', objektart: 'Gipfel' } }]),
      );

    const result = await suggestTourName({ lng: 7.6589, lat: 45.9763 });
    expect(result).toBe('Matterhorn');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should pick highest-priority Objektart when multiple results exist', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        makeIdentifyResponse([
          { attributes: { name: 'Berghaus Kulm', objektart: 'Gebäude' } },
          { attributes: { name: 'Rigi Kulm', objektart: 'Alpiner Gipfel' } },
          { attributes: { name: 'Rigi Berggebiet', objektart: 'Gebiet' } },
        ]),
      );

    const result = await suggestTourName({ lng: 8.4845, lat: 47.0564 });
    expect(result).toBe('Rigi Kulm');
  });

  it('should name a pin inside a whole valley by the nearest named spot, not the valley', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        makeIdentifyResponse([{ attributes: { name: 'Griessental', objektart: 'Tal' } }]),
      )
      .mockResolvedValueOnce(
        makeIdentifyResponse([
          { attributes: { name: 'Griessental', objektart: 'Tal' }, geometry: { rings: [] } },
          {
            attributes: { name: 'Hinter Griessbänder', objektart: 'Lokalname swisstopo' },
            geometry: { points: [[2600250, 1200000]] },
          },
          {
            attributes: { name: 'Schärpfi', objektart: 'Lokalname swisstopo' },
            geometry: { points: [[2600090, 1200000]] },
          },
        ]),
      );
    jest
      .spyOn(
        require('@/core/utils/wgs84-to-lv95') as typeof import('@/core/utils/wgs84-to-lv95'),
        'wgs84ToLv95',
      )
      .mockReturnValue({ easting: 2600000, northing: 1200000 });

    expect(await suggestTourName({ lng: 8.45, lat: 46.84 })).toBe('Schärpfi');
  });

  it("should keep the valley's name when no named spot lies near the pin", async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        makeIdentifyResponse([{ attributes: { name: 'Griessental', objektart: 'Tal' } }]),
      )
      .mockResolvedValueOnce(makeIdentifyResponse([]));

    expect(await suggestTourName({ lng: 8.45, lat: 46.84 })).toBe('Griessental');
  });

  it('should name a main summit by the summit, not the station building on it', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        makeIdentifyResponse([
          { attributes: { name: 'Bergstation Titlis', objektart: 'Gebaeude' } },
          { attributes: { name: 'Titlis', objektart: 'Hauptgipfel' } },
        ]),
      );
    expect(await suggestTourName({ lng: 8.4378, lat: 46.7724 })).toBe('Titlis');
  });

  it("should not name a pin on a summit's flank after the summit 400 m away", async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(makeIdentifyResponse([]))
      .mockResolvedValueOnce(
        makeIdentifyResponse([
          {
            attributes: { name: 'Tschudi', objektart: 'Hauptgipfel' },
            geometry: { points: [[2600400, 1200000]] },
          },
          {
            attributes: { name: 'Wiss Tritt', objektart: 'Lokalname swisstopo' },
            geometry: { points: [[2600300, 1200000]] },
          },
        ]),
      );
    jest
      .spyOn(
        require('@/core/utils/wgs84-to-lv95') as typeof import('@/core/utils/wgs84-to-lv95'),
        'wgs84ToLv95',
      )
      .mockReturnValue({ easting: 2600000, northing: 1200000 });

    expect(await suggestTourName({ lng: 8.42, lat: 46.85 })).toBe('Wiss Tritt');
  });

  it('should rank Gipfel above Pass above Gletscher', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        makeIdentifyResponse([
          { attributes: { name: 'Grimselpass', objektart: 'Pass' } },
          { attributes: { name: 'Rhonegletscher', objektart: 'Gletscher' } },
          { attributes: { name: 'Bös Fulen', objektart: 'Gipfel' } },
        ]),
      );

    const result = await suggestTourName({ lng: 8.33, lat: 46.57 });
    expect(result).toBe('Bös Fulen');
  });

  it('should fall back to label with HTML stripped when name is absent', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        makeIdentifyResponse([{ attributes: { label: '<b>Flurname Here</b>' } }]),
      );

    const result = await suggestTourName({ lng: 8.0, lat: 46.5 });
    expect(result).toBe('Flurname Here');
  });

  it('should return null when both searches return empty results', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(makeIdentifyResponse([]))
      .mockResolvedValueOnce(makeIdentifyResponse([]));

    const result = await suggestTourName({ lng: 8.0, lat: 46.5 });
    expect(result).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should return null when attributes are missing', async () => {
    jest.mocked(fetch).mockResolvedValueOnce(makeIdentifyResponse([{}]));

    const result = await suggestTourName({ lng: 8.0, lat: 46.5 });
    expect(result).toBeNull();
  });

  it('should return null on non-OK HTTP response', async () => {
    jest.mocked(fetch).mockResolvedValue(new Response('Not Found', { status: 404 }));

    const result = await suggestTourName({ lng: 8.0, lat: 46.5 });
    expect(result).toBeNull();
  });

  it('should return null on network error', async () => {
    jest.mocked(fetch).mockRejectedValueOnce(new Error('Network failure'));

    const result = await suggestTourName({ lng: 8.0, lat: 46.5 });
    expect(result).toBeNull();
  });

  it('should return null on timeout (AbortError)', async () => {
    jest
      .mocked(fetch)
      .mockRejectedValueOnce(Object.assign(new DOMException('Aborted', 'AbortError')));

    const result = await suggestTourName({ lng: 8.0, lat: 46.5 });
    expect(result).toBeNull();
  });

  it('should call the identify API with LV95 (sr=2056) and swissnames3d layer', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        makeIdentifyResponse([{ attributes: { name: 'Zürich HB', objektart: 'Gebäude' } }]),
      );

    await suggestTourName({ lng: 8.5402, lat: 47.3777 });

    const url = jest.mocked(fetch).mock.calls[0]![0] as string;
    expect(url).toContain('MapServer/identify');
    expect(url).toContain('sr=2056');
    expect(url).toContain('swissnames3d');
    expect(url).toContain('geometry=');
  });
  it('should abort the request and return null when the caller stops waiting', async () => {
    hangingFetch();
    const caller = new AbortController();
    const result = suggestTourName({ lng: 8.0, lat: 46.5 }, caller.signal);
    caller.abort();
    expect(await result).toBeNull();
  });
});

describe('suggestAreaName', () => {
  beforeEach(() => {
    stubGlobal('fetch', jest.fn());
  });

  afterEach(() => {
    unstubAllGlobals();
  });

  it('should name a region after the town its centre lies in, the official name first', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(
        makeIdentifyResponse([
          { attributes: { name: 'Praborgne', objektart: 'Ort', status: 'informell' } },
          { attributes: { name: 'Zermatt', objektart: 'Ort', status: 'offiziell' } },
        ]),
      )
      .mockResolvedValueOnce(
        makeIdentifyResponse([
          { attributes: { name: 'Mattertal', objektart: 'Tal', status: 'offiziell' } },
        ]),
      );

    await expect(suggestAreaName({ lng: 7.749, lat: 46.02 })).resolves.toBe('Zermatt');
  });

  it('should name it after the valley around when its centre lies in no named area', async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(makeIdentifyResponse([]))
      .mockResolvedValueOnce(
        makeIdentifyResponse([
          { attributes: { name: 'Wengen', objektart: 'Ort' } },
          { attributes: { name: 'Mirrenflue', objektart: 'Gebiet' } },
          { attributes: { name: 'Lauterbrunnental', objektart: 'Tal' } },
        ]),
      );

    await expect(suggestAreaName({ lng: 7.909, lat: 46.594 })).resolves.toBe('Lauterbrunnental');
  });

  it("should fall back to the tour lookup's name when no valley, town or area is near", async () => {
    jest
      .mocked(fetch)
      .mockResolvedValueOnce(makeIdentifyResponse([]))
      .mockResolvedValueOnce(
        makeIdentifyResponse([{ attributes: { name: 'Aabach', objektart: 'Fliessgewaesser' } }]),
      )
      .mockResolvedValueOnce(
        makeIdentifyResponse([{ attributes: { name: 'Tällistock', objektart: 'Gipfel' } }]),
      );

    await expect(suggestAreaName({ lng: 8.3, lat: 46.75 })).resolves.toBe('Tällistock');
  });

  it('should give no name once the caller stops waiting', async () => {
    const caller = new AbortController();
    hangingFetch();
    hangingFetch();
    const name = suggestAreaName({ lng: 8.3, lat: 46.75 }, caller.signal);
    caller.abort();

    await expect(name).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
