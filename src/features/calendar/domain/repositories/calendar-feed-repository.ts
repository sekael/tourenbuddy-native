/** A connected feed. Only the host is kept: the full URL is a bearer credential (design D8). */
export interface CalendarFeed {
  id: string;
  host: string;
  label: string | null;
  lastSyncedAt: string | null;
  /** Worker error code (`http_403`, `too_large`, …), null when the last run succeeded. */
  lastError: string | null;
}

export interface CalendarSettings {
  /** `HH:MM` Zurich wall time. */
  coreStart: string;
  coreEnd: string;
  minFreeMinutes: number;
  feedToken: string;
}

export type CalendarFeedErrorCode =
  'limit' | 'duplicate' | 'invalid_url' | 'not_ical' | 'invalid_window' | 'sync_failed' | 'unknown';

/** Repository failures, already classified — raw database text never leaves the data layer. */
export class CalendarFeedError extends Error {
  constructor(
    readonly code: CalendarFeedErrorCode,
    cause?: unknown,
  ) {
    super(code, { cause });
  }
}

export interface CalendarFeedRepository {
  listFeeds: () => Promise<CalendarFeed[]>;
  /** `url` must already be normalized (`feedUrlSchema`). */
  addFeed: (url: string, label: string | null) => Promise<void>;
  removeFeed: (id: string) => Promise<void>;
  relabelFeed: (id: string, label: string | null) => Promise<void>;
  /** The caller's settings, created with defaults on first read. */
  getSettings: () => Promise<CalendarSettings>;
  updateSettings: (settings: Omit<CalendarSettings, 'feedToken'>) => Promise<void>;
  /** Issues a new feed token; the previous feed URL 404s immediately. */
  regenerateToken: () => Promise<string>;
  /** On-demand Worker sync for the caller (`POST /calendar/sync`). */
  triggerSync: () => Promise<void>;
}
