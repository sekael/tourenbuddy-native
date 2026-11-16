import NetInfo from '@react-native-community/netinfo';

import { sessionTrust } from '@/core/auth/session-trust';
import { connectivity, isOnline, isReachable, RECHECK_MS } from '@/core/offline/online';

// The re-probe runs on timers and asks the backend through `fetch`: both stand-ins here.
jest.useFakeTimers();
const fetchMock = jest.fn<Promise<unknown>, unknown[]>();
global.fetch = fetchMock as unknown as typeof fetch;

// The PWA's use-online-status.test.ts, for the OS signal.
describe('reachability', () => {
  const listener = () =>
    jest.mocked(NetInfo.addEventListener).mock.calls[0]![0] as (state: object) => void;

  beforeEach(() => {
    listener()({ isConnected: true, isInternetReachable: true });
    connectivity.setState({ online: true });
    sessionTrust.setState({ unverified: false });
    fetchMock.mockReset();
  });

  it('should go offline when the OS reports no connection, and back', () => {
    listener()({ isConnected: false, isInternetReachable: false });
    expect(isOnline()).toBe(false);
    listener()({ isConnected: true, isInternetReachable: true });
    expect(isOnline()).toBe(true);
  });

  it('should count Wi-Fi without internet as offline, and an unknown probe as online', () => {
    listener()({ isConnected: true, isInternetReachable: false });
    expect(isOnline()).toBe(false);
    listener()({ isConnected: true, isInternetReachable: null });
    expect(isOnline()).toBe(true);
  });

  it('should treat an unverified session as unreachable while online', () => {
    sessionTrust.setState({ unverified: true });
    expect(isOnline()).toBe(true);
    expect(isReachable()).toBe(false);
  });

  it('should come back online when the backend answers though the OS still says offline', async () => {
    // The iOS Simulator never reports the network coming back: the PWA's re-probe covers it.
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    listener()({ isConnected: false, isInternetReachable: false });
    await jest.advanceTimersByTimeAsync(RECHECK_MS);
    expect(isOnline()).toBe(false);

    fetchMock.mockResolvedValue({ status: 401 });
    await jest.advanceTimersByTimeAsync(RECHECK_MS);
    expect(isOnline()).toBe(true);

    // Still unsure of the OS, it keeps asking: the next failure is offline again.
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await jest.advanceTimersByTimeAsync(RECHECK_MS);
    expect(isOnline()).toBe(false);
  });

  it('should stop asking the backend once the OS says online', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    listener()({ isConnected: false, isInternetReachable: false });
    listener()({ isConnected: true, isInternetReachable: null });
    await jest.advanceTimersByTimeAsync(RECHECK_MS * 3);

    expect(isOnline()).toBe(true);
    // At most the probe already waiting when the OS changed its mind.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
