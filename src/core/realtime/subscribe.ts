/**
 * The app's only way into Supabase Realtime. Realtime is UI sync only: callbacks refetch what the
 * app shows and never send, record or show notifications (the database emits those and the Worker
 * delivers them).
 */
import type { RealtimeChannel, RealtimePostgresChangesFilter } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { bounded } from '@/core/async';
import { sessionTrust } from '@/core/auth/session-trust';
import { createLogger } from '@/core/logging/logger';
import { supabase } from '@/core/supabase';

export type PostgresBinding = {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  table: string;
  /** Always user-scoped, e.g. `user_id=eq.<uid>`. */
  filter?: string;
};

export type RealtimeSubscription = {
  /**
   * User-scoped channel name, e.g. `friendships:<uid>`. Consumers of one topic share its channel,
   * and the first one's bindings define it.
   */
  topic: string;
  /** Something changed: refetch. Debounced by 150 ms per consumer. */
  onChange: () => void;
  /**
   * The channel is listening: fetch the baseline. Runs on every subscribe (first, after a rejoin,
   * after a resume from the background), at once when joining a subscribed channel, and when an
   * unverified session is confirmed.
   */
  onSubscribed?: () => void;
} & ({ postgres: PostgresBinding[]; broadcast?: never } | { broadcast: string; postgres?: never });

type Listener = { onChange: () => void; onSubscribed?: () => void };

type Entry = {
  spec: RealtimeSubscription;
  listeners: Set<Listener>;
  channel?: RealtimeChannel;
  subscribed: boolean;
};

const DEBOUNCE_MS = 150;
const RESUME_BOUND_MS = 4000;

const log = createLogger('Realtime');
const entries = new Map<string, Entry>();
// A removed channel keeps its topic until the server confirms the leave, and `channel(topic)`
// hands back that closing channel: a topic reopens only once its old channel is gone.
const closing = new Map<string, Promise<unknown>>();
let foreground = AppState.currentState !== 'background';

function open(entry: Entry) {
  const { spec, listeners } = entry;
  const pending = closing.get(spec.topic);
  if (pending) {
    void pending.then(() => {
      if (closing.get(spec.topic) === pending) closing.delete(spec.topic);
      if (foreground && entries.get(spec.topic) === entry && !entry.channel) open(entry);
    });
    return;
  }

  const notify = () => listeners.forEach((listener) => listener.onChange());
  const channel = spec.broadcast
    ? supabase.channel(spec.topic, { config: { private: true } })
    : supabase.channel(spec.topic);
  if (spec.broadcast) {
    channel.on('broadcast', { event: spec.broadcast }, notify);
  } else {
    for (const binding of spec.postgres ?? []) {
      // `.on()` has one overload per event literal; the payload is ignored, so the widest fits.
      const filter = { schema: 'public', ...binding } as RealtimePostgresChangesFilter<'*'>;
      channel.on('postgres_changes', filter, notify);
    }
  }
  channel.subscribe((status) => {
    if (entry.channel !== channel) return;
    entry.subscribed = status === 'SUBSCRIBED';
    if (entry.subscribed) listeners.forEach((listener) => listener.onSubscribed?.());
    // realtime-js rejoins on its own; its next SUBSCRIBED refetches.
    else if (status !== 'CLOSED') log.warn(`${spec.topic}: ${status}`);
  });
  entry.channel = channel;
}

function close(entry: Entry) {
  const { channel } = entry;
  if (!channel) return;
  entry.channel = undefined;
  entry.subscribed = false;
  closing.set(
    entry.spec.topic,
    supabase.removeChannel(channel).catch(() => {}),
  );
}

/** Subscribes to a topic; returns the function that ends the subscription. */
export function subscribeRealtime(spec: RealtimeSubscription): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listener: Listener = {
    onChange: () => {
      clearTimeout(timer);
      timer = setTimeout(spec.onChange, DEBOUNCE_MS);
    },
    onSubscribed: spec.onSubscribed,
  };

  let entry = entries.get(spec.topic);
  if (!entry) {
    entry = { spec, listeners: new Set(), subscribed: false };
    entries.set(spec.topic, entry);
  }
  const joined = entry;
  joined.listeners.add(listener);
  if (joined.subscribed) spec.onSubscribed?.();
  else if (!joined.channel && foreground) open(joined);

  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    clearTimeout(timer);
    joined.listeners.delete(listener);
    if (joined.listeners.size === 0) {
      close(joined);
      entries.delete(spec.topic);
    }
  };
}

// Channels close in the background (on web: a hidden page) and reopen in the foreground, where
// their SUBSCRIBED refetches whatever was missed. `inactive` (Control Center, the app switcher)
// leaves the app visible, so it changes nothing.
AppState.addEventListener('change', (state) => {
  if (state !== 'active' && state !== 'background') return;
  const next = state === 'active';
  if (next === foreground) return;
  foreground = next;
  if (!foreground) {
    for (const entry of entries.values()) close(entry);
    return;
  }
  // After an hour away the access token has expired, and realtime-js joins with the token it has
  // cached. Without an argument `setAuth` asks supabase-js, which refreshes an expired token;
  // offline that retries for 30 s, so the wait is bounded.
  const refreshed = supabase.realtime
    .setAuth()
    .catch((error: unknown) => log.warn('Could not refresh the Realtime token', error));
  void bounded(refreshed, RESUME_BOUND_MS).then(() => {
    if (!foreground) return;
    for (const entry of entries.values()) if (!entry.channel) open(entry);
  });
});

// Reads were skipped while the session was unverified; nothing else would refetch, since the
// channels never dropped.
sessionTrust.subscribe((state, previous) => {
  if (!previous.unverified || state.unverified) return;
  for (const entry of entries.values()) {
    if (entry.subscribed) entry.listeners.forEach((listener) => listener.onSubscribed?.());
  }
});
