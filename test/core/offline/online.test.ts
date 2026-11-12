import NetInfo from '@react-native-community/netinfo';

import { sessionTrust } from '@/core/auth/session-trust';
import { connectivity, isOnline, isReachable } from '@/core/offline/online';

// The PWA's use-online-status.test.ts, for the OS signal.
describe('reachability', () => {
  const listener = () =>
    jest.mocked(NetInfo.addEventListener).mock.calls[0]![0] as (state: object) => void;

  beforeEach(() => {
    connectivity.setState({ online: true });
    sessionTrust.setState({ unverified: false });
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
});
