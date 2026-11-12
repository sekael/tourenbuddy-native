import type { AvailabilityRow } from '@/features/calendar/data/models/availability';

/**
 * Availability persistence. Days are `dayKey` strings (`YYYY-MM-DD`).
 */
export interface AvailabilityRepository {
  /** Own available days from `fromDate` (inclusive) onward. */
  listOwnFrom: (fromDate: string) => Promise<string[]>;
  /** Atomically insert `added` days and delete `removed` days for the caller. */
  applyDiff: (added: string[], removed: string[]) => Promise<void>;
  /**
   * Accepted friends' available days from `fromDate` onward, as `(user_id, date)`
   * rows. Own rows are excluded; friend-SELECT RLS (#244) scopes the rest.
   */
  listFriendsFrom: (fromDate: string) => Promise<AvailabilityRow[]>;
}
