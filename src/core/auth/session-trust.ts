import { createStore } from 'zustand/vanilla';

/**
 * Is the session UNVERIFIED: restored from storage without a successful token refresh, because
 * the refresh was unreachable at launch? The app then runs on the stored user and its caches,
 * but the server rejects the stale token until auth-js's next refresh succeeds.
 *
 * Here rather than in the auth store, because `core/` (Realtime, later the outbox) reads it and
 * `core/` never imports a feature. The auth store is the only writer.
 */
export const sessionTrust = createStore(() => ({ unverified: false }));
