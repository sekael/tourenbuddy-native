import { createStore } from 'zustand/vanilla';

/**
 * The signed-in user's id, for `core/` (the offline outbox tags and filters its entries by it), which
 * may not import the auth feature. The auth store is the only writer, next to `sessionTrust`.
 */
export const sessionUser = createStore(() => ({ id: null as string | null }));
