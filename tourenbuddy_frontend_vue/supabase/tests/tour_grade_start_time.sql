-- Grade and start time on tours (change: smarter-tour-creation, design D3–D5).
--
-- Pins the write contract (null keeps, '' clears, no date no time), the CHECKs, the friend view
-- gating, the suggestion field and `dates` serialization, and that both are meaningful changes.
-- Patrick and Jakob are accepted friends in the seed; Jakob is no partner of the test tour.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db

\set ON_ERROR_STOP on

\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'
\set tour 'dddddddd-0000-0000-0000-000000000021'

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.create_tour_full(
  p_id := :'tour', p_name := 'Sustenhorn', p_goal := 'POINT(8.4551 46.6989)',
  p_planned_date := '2027-03-13', p_tour_types := array['skitour'],
  p_grade := ' ZS- ', p_start_time := '06:30'
);
reset role;
select is((select array[grade, start_time::text] from public.tours where id = :'tour'),
  array['ZS-', '06:30:00'], '1 a create stores the trimmed grade and the start time');

-- A stale client (no p_grade / p_start_time) editing the tour.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.update_tour_full(
  p_id := :'tour', p_name := 'Sustenhorn', p_goal := 'POINT(8.4551 46.6989)',
  p_planned_date := '2027-03-14', p_tour_types := array['skitour']
);
reset role;
select is((select array[grade, start_time::text] from public.tours where id = :'tour'),
  array['ZS-', '06:30:00'], '2 an update without the new arguments keeps grade and time');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select is((select array[grade, start_time] from public.friend_tours_view where id = :'tour'),
  array['ZS-', null], '3 a friend who is no partner sees the grade but not the time');
reset role;

-- `dates` carries the time as HH:MM, and nothing extra without one.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select is(public.tour_field_value(:'tour', 'dates')->>'startTime', '06:30',
  '4 the dates value carries the start time as HH:MM');
select is(public.tour_field_value('cccccccc-0000-0000-0000-000000000001', 'dates') ? 'startTime', false,
  '5 a tour without a time serializes its dates as before');
select public.update_tour_full(
  p_id := :'tour', p_name := 'Sustenhorn', p_goal := 'POINT(8.4551 46.6989)',
  p_planned_date := '2027-03-14', p_tour_types := array['skitour'], p_grade := '', p_start_time := '07:15'
);
reset role;
select is((select array[grade, start_time::text] from public.tours where id = :'tour'),
  array[null, '07:15:00'], '6 an empty grade clears it, a new time replaces the old');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.update_tour_full(p_id := :'tour', p_name := 'Sustenhorn', p_goal := 'POINT(8.4551 46.6989)');
reset role;
select is((select start_time from public.tours where id = :'tour'), null,
  '7 clearing the date clears the time, even for a caller that keeps it');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select throws_ok(
  format($$select public.update_tour_full(p_id := %L, p_name := 'X', p_goal := 'POINT(8.4 46.6)', p_grade := %L)$$,
    :'tour', repeat('x', 21)),
  '23514', null, '8 a grade over 20 characters is rejected');
reset role;

-- Suggestions: `grade` is a field, `dates` writes the time.
insert into public.tour_suggestion (id, tour_id, owner_id, suggester_id, batch_id, field, value)
values
  ('eeeeeeee-0000-0000-0000-000000000021', :'tour', :'patrick', :'jakob', gen_random_uuid(), 'grade', '"WS+"'),
  ('eeeeeeee-0000-0000-0000-000000000022', :'tour', :'patrick', :'jakob', gen_random_uuid(), 'dates',
   '{"plannedDate": "2027-03-20", "endDate": null, "startTime": "05:45"}');
select public.fn_apply_tour_suggestion('eeeeeeee-0000-0000-0000-000000000021', null);
select public.fn_apply_tour_suggestion('eeeeeeee-0000-0000-0000-000000000022', null);
select is((select array[grade, planned_date::text, start_time::text] from public.tours where id = :'tour'),
  array['WS+', '2027-03-20', '05:45:00'], '9 accepted grade and dates suggestions write grade, date and time');

select ok(
  (select public.fn_is_meaningful_tour_change(t, jsonb_populate_record(t, '{"grade": "S"}'), false)
     from public.tours t where t.id = :'tour'),
  '10 a grade change is meaningful');
select ok(
  (select public.fn_is_meaningful_tour_change(t, jsonb_populate_record(t, '{"start_time": "09:00"}'), false)
     from public.tours t where t.id = :'tour'),
  '11 a start-time change is meaningful');

-- A dates suggestion that never names a time keeps the owner's; an explicit null clears it.
-- One pending suggestion per field: each one is applied and removed before the next.
delete from public.tour_suggestion where tour_id = :'tour';
insert into public.tour_suggestion (id, tour_id, owner_id, suggester_id, batch_id, field, value)
values ('eeeeeeee-0000-0000-0000-000000000023', :'tour', :'patrick', :'jakob', gen_random_uuid(), 'dates',
  '{"plannedDate": "2027-03-21", "endDate": null}');
select public.fn_apply_tour_suggestion('eeeeeeee-0000-0000-0000-000000000023', null);
select is((select start_time::text from public.tours where id = :'tour'), '05:45:00',
  '12 a dates suggestion without a time keeps the owner''s');
delete from public.tour_suggestion where tour_id = :'tour';
insert into public.tour_suggestion (id, tour_id, owner_id, suggester_id, batch_id, field, value)
values ('eeeeeeee-0000-0000-0000-000000000024', :'tour', :'patrick', :'jakob', gen_random_uuid(), 'dates',
  '{"plannedDate": "2027-03-21", "endDate": null, "startTime": null}');
select public.fn_apply_tour_suggestion('eeeeeeee-0000-0000-0000-000000000024', null);
select is((select start_time from public.tours where id = :'tour'), null,
  '13 an explicit null start time clears it');

select * from finish();
rollback;
