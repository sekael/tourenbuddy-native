import { z } from 'zod';

/**
 * A feed URL as typed or pasted. Calendar apps commonly hand out `webcal://` (iCloud, many
 * Outlook / Nextcloud copy buttons) — same resource over https, so normalize it. Plain `http://`
 * is rejected: the URL is a bearer credential. The DB `check (url like 'https://%')` is the backstop.
 */
export const feedUrlSchema = z
  .string()
  .trim()
  .transform((url) => url.replace(/^webcal:\/\//i, 'https://'))
  .pipe(
    z
      .string()
      .url()
      .regex(/^https:\/\//i),
  )
  // Google's embed/share links (`calendar/embed?src=…`) look plausible but answer 401 for any
  // non-public calendar. Only `/calendar/ical/…` is a feed.
  // ponytail: Google only, the common mix-up; other providers surface as a feed error after sync.
  .refine(
    (url) => !/^https:\/\/calendar\.google\.com\//i.test(url) || /\/calendar\/ical\//i.test(url),
    { message: 'not_ical' },
  );

/** Raw `user_calendar_feeds` row. */
export const calendarFeedRowSchema = z.object({
  id: z.string().guid(),
  url: z.string(),
  label: z.string().nullable(),
  last_synced_at: z.string().nullable(),
  last_error: z.string().nullable(),
});

/** Raw `user_calendar_settings` row. Postgres `time` serializes as `HH:MM:SS`. */
export const calendarSettingsRowSchema = z.object({
  core_start: z.string(),
  core_end: z.string(),
  min_free_minutes: z.number().int(),
  feed_token: z.string().guid(),
});
