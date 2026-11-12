import { z } from 'zod';

/**
 * Raw row from Supabase `user_availability`. `date` is a Postgres `date`,
 * serialized as a `YYYY-MM-DD` string — the same shape the calendar uses to key
 * days (`dayKey`), so we keep it as a string rather than a `Date` to avoid a
 * timezone round-trip.
 */
export const availabilityRowSchema = z.object({
  user_id: z.string().guid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type AvailabilityRow = z.infer<typeof availabilityRowSchema>;
