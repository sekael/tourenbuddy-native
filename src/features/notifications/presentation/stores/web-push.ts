/**
 * Web Push lives in `web-push.web.ts`; the phones use their own push tokens (the notifications
 * store), so nothing here is ever called on iOS or Android.
 */
const unavailable = async () => false;

export const webPush = {
  permission: (): 'granted' | 'denied' | 'undetermined' => 'denied',
  subscribe: unavailable,
  unsubscribe: async () => {},
  ensureSubscription: unavailable,
};
