import { putCached } from '@/core/offline/entity-cache';
import {
  checkForUpdate,
  compareVersions,
  requiredUpdate,
  resetUpdateCheck,
  updateGate,
} from '@/core/update/gate';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.2.0' }));
jest.mock('@/core/offline/entity-cache', () => {
  const store = new Map<string, unknown>();
  return {
    getCached: jest.fn(async (key: string) => store.get(key)),
    putCached: jest.fn(async (key: string, value: unknown) => void store.set(key, value)),
  };
});

const respond = (body: unknown, ok = true) =>
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => body } as Response);

beforeEach(() => {
  resetUpdateCheck();
  jest.restoreAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('compareVersions', () => {
  it.each([
    ['1.2.0', '1.2.0', 0],
    ['1.2', '1.2.0', 0],
    ['1.10.0', '1.9.9', 1],
    ['0.9.9', '1.0.0', -1],
    ['1.2.0-beta.1', '1.2.0', 0],
  ])('should compare %s with %s as %d', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });
});

describe('requiredUpdate', () => {
  it('should send an older app to the store search when no store URL is set', () => {
    expect(requiredUpdate('1.0.0', { min_supported_ios: '1.1.0' }, 'ios')).toMatch(
      /apps\.apple\.com/,
    );
  });

  it('should let the minimum version and newer through', () => {
    expect(requiredUpdate('1.1.0', { min_supported_ios: '1.1.0' }, 'ios')).toBeNull();
    expect(requiredUpdate('2.0.0', { min_supported_ios: '1.1.0' }, 'ios')).toBeNull();
  });

  it('should only read its own platform, and never gate without a version or on the web', () => {
    expect(requiredUpdate('1.0.0', { min_supported_android: '9.0.0' }, 'ios')).toBeNull();
    expect(requiredUpdate(null, { min_supported_ios: '9.0.0' }, 'ios')).toBeNull();
    expect(requiredUpdate('1.0.0', { min_supported_ios: '9.0.0' }, 'web')).toBeNull();
  });
});

describe('checkForUpdate', () => {
  it('should gate an app below the published minimum', async () => {
    respond({ min_supported_ios: '2.0.0', ios_store_url: 'https://apps.apple.com/app/id1' });
    await checkForUpdate();
    expect(updateGate.getState().storeUrl).toBe('https://apps.apple.com/app/id1');
  });

  it('should keep gating on the last good answer when the fetch fails', async () => {
    await putCached('app-config', { min_supported_ios: '2.0.0' });
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    await checkForUpdate();
    expect(updateGate.getState().storeUrl).toMatch(/apps\.apple\.com/);
  });

  it('should not gate on a malformed file with nothing cached before', async () => {
    jest
      .requireMock<{ getCached: jest.Mock }>('@/core/offline/entity-cache')
      .getCached.mockResolvedValueOnce(undefined);
    respond({ min_supported_ios: 'soon' });
    await checkForUpdate();
    expect(updateGate.getState().storeUrl).toBeNull();
  });

  it('should check at most every 15 minutes', async () => {
    const fetchSpy = respond({ min_supported_ios: '0.1.0' });
    await checkForUpdate(1_000_000);
    await checkForUpdate(1_000_000 + 60_000);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    await checkForUpdate(1_000_000 + 16 * 60_000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
