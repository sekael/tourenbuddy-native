-- The user's pace (change: draw-tour-tracks, design D11).
--
-- A speed factor for every time the app estimates, as in the swisstopo app's tortoise-to-hare
-- slider: time = the rule's time / pace, 0.5–1.5 in steps of 0.1. Kept on the profile so it
-- follows the user to every device. Covered by the table's existing grants and own-row policies.
--
-- Stale clients upsert the profile without this column, which leaves it as it is.
alter table public.user_profile
  add column pace numeric(2, 1) not null default 1.0
    constraint user_profile_pace_check check (pace between 0.5 and 1.5);
