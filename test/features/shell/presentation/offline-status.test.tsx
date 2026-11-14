import { act, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { sessionTrust } from '@/core/auth/session-trust';
import '@/core/i18n';
import { connectivity } from '@/core/offline/online';
import { offlineSignals } from '@/core/offline/signals';
import type { WriteQueueEntry } from '@/core/offline/write-queue';
import { OfflineCapsule, watchOfflineFlashes } from '@/features/shell/presentation/offline-status';

// SwiftUI renders as inert views carrying their props: the capsule's text is its label's `title`.
const shown = () =>
  screen.container
    .queryAll((node) => typeof node.props.title === 'string' && !!node.props.systemImage)
    .map((node) => node.props.title as string);

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};
const renderStatus = () =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <OfflineCapsule />
    </SafeAreaProvider>,
  );

const dead = { entityId: 'e1', kind: 'tour', op: 'update' } as WriteQueueEntry;

let stop: () => void;
beforeEach(() => {
  stop = watchOfflineFlashes();
});
afterEach(() => {
  stop();
  connectivity.setState({ online: true });
  sessionTrust.setState({ unverified: false });
  offlineSignals.setState({ pendingCount: 0, deadLetters: [], offlineBlockedAt: 0 });
});

describe('OfflineCapsule', () => {
  it('should say nothing while online with nothing waiting', async () => {
    await renderStatus();
    expect(shown()).toEqual([]);
  });

  it('should put changes that could not sync before being offline', async () => {
    connectivity.setState({ online: false });
    offlineSignals.setState({ pendingCount: 2, deadLetters: [dead] });
    await renderStatus();
    expect(shown()).toEqual(["1 change couldn't sync"]);
  });

  it('should count the waiting changes while offline', async () => {
    connectivity.setState({ online: false });
    offlineSignals.setState({ pendingCount: 2 });
    await renderStatus();
    expect(shown()).toEqual(['Offline · 2 changes waiting to sync']);
  });

  it('should flash a refused action, then return to the offline state', async () => {
    jest.useFakeTimers();
    connectivity.setState({ online: false });
    await renderStatus();
    await act(async () => offlineSignals.setState({ offlineBlockedAt: Date.now() }));
    expect(shown()).toEqual(["This action isn't available offline"]);

    await act(async () => jest.advanceTimersByTime(3000));
    expect(shown()).toEqual(['Offline · showing saved data']);
    jest.useRealTimers();
  });

  it('should tell when the waiting changes have synced, then go', async () => {
    jest.useFakeTimers();
    offlineSignals.setState({ pendingCount: 3 });
    await renderStatus();
    await act(async () => offlineSignals.setState({ pendingCount: 0 }));
    expect(shown()).toEqual(['3 changes synced']);

    await act(async () => jest.advanceTimersByTime(3000));
    // The fade-out runs on the same clock.
    await act(async () => jest.advanceTimersByTime(1000));
    expect(shown()).toEqual([]);
    jest.useRealTimers();
  });
});
