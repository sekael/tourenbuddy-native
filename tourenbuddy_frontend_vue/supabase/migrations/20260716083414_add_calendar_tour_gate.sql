-- Calendar-tour auto-show gate on user_profile.
--
-- calendar_tour_show_on_first_open: auto-start gate for the calendar spotlight
--   tour. Flips to false once the tour is first shown (auto-chain from the map
--   tour OR standalone first calendar open) so it never auto-shows again.
--   `default true` grants every existing user exactly one auto-show — intentional
--   (feature discovery), so there is NO backfill UPDATE here. Mirrors
--   onboarding_tour_show_at_sign_in (see add_onboarding_tour_state).
--
-- Column-add on an already-granted table: inherits the table's RLS policies and
-- Data API grants, so no new grants are needed. No resume index — the calendar
-- tour is 3 steps and dismissing simply flips the gate.
alter table public.user_profile
  add column calendar_tour_show_on_first_open boolean not null default true;
