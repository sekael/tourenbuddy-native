export interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
}

/**
 * Push subscriptions are per DEVICE (#148): every call is scoped to one browser endpoint.
 * There is deliberately no "remove all for user" — disabling push on one device must never
 * silence the others.
 */
export interface PushSubscriptionRepository {
  /** Register (or re-own) this browser's endpoint for the signed-in user. */
  register: (data: PushSubscriptionData) => Promise<void>;
  removeSubscription: (endpoint: string) => Promise<void>;
}
