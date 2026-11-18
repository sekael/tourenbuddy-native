import { AppState } from 'react-native';

import { sessionTrust } from '@/core/auth/session-trust';
import { sessionUser } from '@/core/auth/session-user';
import { connectivity } from '@/core/offline/online';
import { replayQueue } from '@/core/offline/replay';
import { registerFlushTriggers } from '@/core/offline/triggers';

jest.mock('@/core/offline/replay', () => ({
  replayQueue: jest.fn(async () => {}),
  refreshQueueStatus: jest.fn(async () => {}),
}));

// The PWA's flush-triggers.test.ts, for the OS and session signals.
describe('flush triggers', () => {
  let onAppState: (state: string) => void;

  beforeAll(() => {
    const spy = jest.spyOn(AppState, 'addEventListener');
    registerFlushTriggers();
    onAppState = spy.mock.calls[0]![1] as (state: string) => void;
  });

  beforeEach(() => {
    connectivity.setState({ online: true });
    sessionTrust.setState({ unverified: false });
    jest.mocked(replayQueue).mockClear();
  });

  it('should drain when the device comes back online, not when it goes offline', () => {
    connectivity.setState({ online: false });
    expect(replayQueue).not.toHaveBeenCalled();
    connectivity.setState({ online: true });
    expect(replayQueue).toHaveBeenCalledTimes(1);
  });

  it('should drain when foregrounded while reachable, never while offline', () => {
    connectivity.setState({ online: false });
    onAppState('active');
    expect(replayQueue).not.toHaveBeenCalled();
    connectivity.setState({ online: true });
    jest.mocked(replayQueue).mockClear();
    onAppState('active');
    expect(replayQueue).toHaveBeenCalledTimes(1);
  });

  it('should drain when a session is confirmed or a user signs in, not on sign-out', () => {
    sessionTrust.setState({ unverified: true });
    sessionTrust.setState({ unverified: false });
    sessionUser.setState({ id: 'u1' });
    expect(replayQueue).toHaveBeenCalledTimes(2);
    sessionUser.setState({ id: null });
    expect(replayQueue).toHaveBeenCalledTimes(2);
  });
});
