import type { AppStateStatus } from 'react-native';

import type { RealtimeSubscription } from '@/core/realtime/subscribe';

type Fake = typeof import('../../support/fake-supabase');

/** A Realtime channel as the primitive uses it; the test drives its status and events. */
class FakeChannel {
  bindings: { type: string; filter: Record<string, unknown>; callback: () => void }[] = [];
  status?: (status: string) => void;
  constructor(
    public topic: string,
    public params?: unknown,
  ) {}
  on(type: string, filter: Record<string, unknown>, callback: () => void) {
    this.bindings.push({ type, filter, callback });
    return this;
  }
  subscribe(callback: (status: string) => void) {
    this.status = callback;
    return this;
  }
  /** The server sends a change for every binding's table. */
  change() {
    this.bindings.forEach((binding) => binding.callback());
  }
}

let channels: FakeChannel[];
let appState: (state: AppStateStatus) => void;
let realtime: typeof import('@/core/realtime/subscribe');
let trust: typeof import('@/core/auth/session-trust');
let supabase: Fake['supabase'];

/** The primitive as loaded at launch, with fresh module state. */
function load(state: AppStateStatus = 'active') {
  jest.isolateModules(() => {
    const { AppState } = jest.requireActual<typeof import('react-native')>('react-native');
    Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      appState = listener as typeof appState;
      return { remove: () => {} };
    });
    // The client the freshly loaded primitive sees.
    supabase = jest.requireMock<Fake>('@/core/supabase').supabase;
    supabase.channel.mockImplementation((topic: string, params?: unknown) => {
      const channel = new FakeChannel(topic, params);
      channels.push(channel);
      return channel;
    });
    supabase.removeChannel.mockResolvedValue('ok');
    realtime = jest.requireActual('@/core/realtime/subscribe');
    trust = jest.requireActual('@/core/auth/session-trust');
  });
}

const subscribe = (spec: Partial<RealtimeSubscription> = {}) => {
  const onChange = jest.fn();
  const onSubscribed = jest.fn();
  const end = realtime.subscribeRealtime({
    topic: 'tours:user-1',
    postgres: [{ event: '*', table: 'tours', filter: 'user_id=eq.user-1' }],
    onChange,
    onSubscribed,
    ...spec,
  } as RealtimeSubscription);
  return { onChange, onSubscribed, end };
};

const last = () => channels[channels.length - 1];

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  channels = [];
  load();
});

afterEach(() => jest.useRealTimers());

describe('subscribeRealtime', () => {
  it('should listen to the bound tables in the public schema, user-scoped', () => {
    subscribe();

    expect(last().topic).toBe('tours:user-1');
    expect(last().bindings).toEqual([
      expect.objectContaining({
        type: 'postgres_changes',
        filter: { schema: 'public', event: '*', table: 'tours', filter: 'user_id=eq.user-1' },
      }),
    ]);
  });

  it('should listen to a broadcast event on a private channel', () => {
    subscribe({ topic: 'friend-tours:user-1', postgres: undefined, broadcast: 'changed' });

    expect(last().params).toEqual({ config: { private: true } });
    expect(last().bindings).toEqual([
      expect.objectContaining({ type: 'broadcast', filter: { event: 'changed' } }),
    ]);
  });

  it('should refetch on every subscribe: first join and rejoin', () => {
    const { onSubscribed } = subscribe();

    last().status!('SUBSCRIBED');
    last().status!('CHANNEL_ERROR');
    last().status!('SUBSCRIBED');

    expect(onSubscribed).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith('[Realtime]', 'tours:user-1: CHANNEL_ERROR');
  });

  it('should debounce a burst of changes into one refetch after 150 ms', () => {
    const { onChange } = subscribe();

    for (let i = 0; i < 5; i++) {
      if (i) jest.advanceTimersByTime(20);
      last().change();
    }
    jest.advanceTimersByTime(149);
    expect(onChange).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('should drop a pending refetch when the subscription ends', () => {
    const { onChange, end } = subscribe();

    last().change();
    end();
    jest.advanceTimersByTime(150);

    expect(onChange).not.toHaveBeenCalled();
    expect(supabase.removeChannel).toHaveBeenCalledWith(channels[0]);
  });

  it('should share a channel and give every consumer its own callbacks', () => {
    const first = subscribe();
    last().status!('SUBSCRIBED');
    const second = subscribe();

    // Joining a channel that already listens: fetch at once.
    expect(second.onSubscribed).toHaveBeenCalledTimes(1);
    expect(channels).toHaveLength(1);

    last().change();
    jest.advanceTimersByTime(150);
    expect(first.onChange).toHaveBeenCalledTimes(1);
    expect(second.onChange).toHaveBeenCalledTimes(1);
  });

  it('should keep the channel until its last consumer leaves, and ignore a second end', () => {
    const first = subscribe();
    const second = subscribe();

    first.end();
    first.end();
    expect(supabase.removeChannel).not.toHaveBeenCalled();
    last().change();
    jest.advanceTimersByTime(150);
    expect(second.onChange).toHaveBeenCalledTimes(1);

    second.end();
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
  });

  it('should reopen a topic only after its old channel is gone', async () => {
    let removed!: () => void;
    supabase.removeChannel.mockReturnValueOnce(new Promise((resolve) => (removed = () => resolve('ok'))));
    subscribe().end();

    subscribe();
    expect(channels).toHaveLength(1);

    await jest.runAllTimersAsync();
    expect(channels).toHaveLength(1);
    removed();
    await jest.runAllTimersAsync();
    expect(channels).toHaveLength(2);
  });

  it('should not reopen a topic whose consumers all left while its old channel closed', async () => {
    let removed!: () => void;
    supabase.removeChannel.mockReturnValueOnce(new Promise((resolve) => (removed = () => resolve('ok'))));
    subscribe().end();
    subscribe().end();

    removed();
    await jest.runAllTimersAsync();
    expect(channels).toHaveLength(1);
  });
});

describe('app lifecycle', () => {
  it('should close channels in the background and keep their consumers', () => {
    const { onSubscribed } = subscribe();
    last().status!('SUBSCRIBED');

    appState('background');

    expect(supabase.removeChannel).toHaveBeenCalledWith(channels[0]);
    expect(onSubscribed).toHaveBeenCalledTimes(1);
  });

  it('should reopen after refreshing the token, and refetch once subscribed', async () => {
    const { onSubscribed } = subscribe();
    appState('background');
    let refreshed!: () => void;
    supabase.realtime.setAuth.mockReturnValueOnce(new Promise<void>((r) => (refreshed = r)));

    appState('active');
    await Promise.resolve();
    expect(channels).toHaveLength(1);

    refreshed();
    await jest.advanceTimersByTimeAsync(0);
    expect(channels).toHaveLength(2);
    last().status!('SUBSCRIBED');
    expect(onSubscribed).toHaveBeenCalledTimes(1);
  });

  it('should not wait for the token refresh longer than 4 s (offline)', async () => {
    subscribe();
    appState('background');
    supabase.realtime.setAuth.mockReturnValueOnce(new Promise(() => {}));

    appState('active');
    await jest.advanceTimersByTimeAsync(3999);
    expect(channels).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(channels).toHaveLength(2);
  });

  it('should stay closed when the app leaves again during the token refresh', async () => {
    load('background');
    subscribe();
    let refreshed!: () => void;
    supabase.realtime.setAuth.mockReturnValueOnce(new Promise<void>((r) => (refreshed = r)));

    appState('active');
    appState('background');
    refreshed();
    await jest.advanceTimersByTimeAsync(0);

    expect(channels).toHaveLength(0);
  });

  it('should ignore a late status from a channel it already closed', async () => {
    subscribe();
    channels[0].status!('SUBSCRIBED');
    appState('background');
    appState('active');
    await jest.advanceTimersByTimeAsync(0);
    channels[1].status!('SUBSCRIBED');

    // The old channel confirms its leave after the new one joined.
    channels[0].status!('CLOSED');

    expect(subscribe().onSubscribed).toHaveBeenCalledTimes(1);
  });

  it('should leave channels open for Control Center and the app switcher', () => {
    subscribe();
    appState('inactive');
    expect(supabase.removeChannel).not.toHaveBeenCalled();
  });

  it('should open nothing until the app comes to the foreground', async () => {
    load('background');
    subscribe();
    expect(channels).toHaveLength(0);

    appState('active');
    await jest.advanceTimersByTimeAsync(0);
    expect(channels).toHaveLength(1);
  });

  it('should refetch when an unverified session is confirmed', () => {
    trust.sessionTrust.setState({ unverified: true });
    const { onSubscribed } = subscribe();
    last().status!('SUBSCRIBED');

    trust.sessionTrust.setState({ unverified: false });

    expect(onSubscribed).toHaveBeenCalledTimes(2);
  });

  it('should not refetch when a verified session stays verified (token refresh)', () => {
    const { onSubscribed } = subscribe();
    last().status!('SUBSCRIBED');

    trust.sessionTrust.setState({ unverified: false });

    expect(onSubscribed).toHaveBeenCalledTimes(1);
  });
});
