-- Onboarding tour state on user_profile.
--
-- onboarding_tour_show_at_sign_in: auto-start gate. Flips to false once the tour
--   is first displayed at sign-in so it never auto-shows again. `default true`
--   means every existing user also gets exactly one auto-show — intentional
--   (feature discovery for existing users), so there is NO backfill UPDATE here.
-- onboarding_tour_last_step: resume index for reopening the tour from the
--   profile sheet. Reset to 0 once the whole tour is finished.
--
-- Both columns inherit the table's existing RLS policies and Data API grants
-- (column-add on an already-granted table needs no new grants).
alter table public.user_profile
  add column onboarding_tour_show_at_sign_in boolean not null default true,
  add column onboarding_tour_last_step integer not null default 0;
