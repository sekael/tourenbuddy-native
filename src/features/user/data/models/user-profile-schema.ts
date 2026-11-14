import { z } from 'zod';

export const supportedLocaleCodeSchema = z.enum(['en', 'de-CH']);
export type SupportedLocaleCode = z.infer<typeof supportedLocaleCodeSchema>;

/** Zod schema for a user profile row from the `user_profile` Supabase table. */
export const userProfileSchema = z.object({
  id: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  locale: supportedLocaleCodeSchema.nullable(),
  // Onboarding tour state (see migration add_onboarding_tour_state).
  onboardingTourShowAtSignIn: z.boolean(),
  onboardingTourLastStep: z.number().int(),
  // Calendar-tour auto-show gate (see migration add_calendar_tour_gate).
  calendarTourShowOnFirstOpen: z.boolean(),
  // One-time sign-in notice for legacy users who missed the calendar step.
  calendarFeatureNoticeShowAtSignIn: z.boolean(),
  /** The user's pace, a speed factor on every estimated time (0.5–1.5; see migration user_profile_pace). */
  pace: z.number(),
  /** Server-stamped `updated_at` — the LWW baseline for offline write replay (DC5). Null offline-optimistic. */
  updatedAt: z.string().nullable().default(null),
});

/** Raw shape returned from Supabase (snake_case). */
export const userProfileRowSchema = z
  .object({
    id: z.string(),
    first_name: z.string().nullable(),
    last_name: z.string().nullable(),
    locale: supportedLocaleCodeSchema.nullish().transform((v) => v ?? null),
    // Defaulted so rows predating the columns (and test fixtures) still parse;
    // the live DB always returns them (NOT NULL defaults).
    onboarding_tour_show_at_sign_in: z.boolean().default(true),
    onboarding_tour_last_step: z.number().int().default(0),
    calendar_tour_show_on_first_open: z.boolean().default(true),
    calendar_feature_notice_show_at_sign_in: z.boolean().default(false),
    pace: z.coerce.number().default(1),
    updated_at: z.string().nullable().default(null),
  })
  .transform((row) => ({
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    locale: row.locale,
    onboardingTourShowAtSignIn: row.onboarding_tour_show_at_sign_in,
    onboardingTourLastStep: row.onboarding_tour_last_step,
    calendarTourShowOnFirstOpen: row.calendar_tour_show_on_first_open,
    calendarFeatureNoticeShowAtSignIn: row.calendar_feature_notice_show_at_sign_in,
    pace: row.pace,
    updatedAt: row.updated_at,
  }));
