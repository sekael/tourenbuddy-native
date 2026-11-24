-- One-time sign-in notice for users who completed the older onboarding tour
-- before the calendar step existed.
--
-- Do not reuse calendar_tour_show_on_first_open: dismissing this notice must not
-- suppress the actual calendar tour that starts when the user opens /calendar.
alter table public.user_profile
  add column calendar_feature_notice_show_at_sign_in boolean not null default false;

update public.user_profile
set calendar_feature_notice_show_at_sign_in = true
where onboarding_tour_show_at_sign_in = false
  and onboarding_tour_last_step = 0
  and calendar_tour_show_on_first_open = true;
