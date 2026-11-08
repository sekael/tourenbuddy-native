-- Activities per leg (change: activity-legs, design D1–D6).
--
-- Pins the CHECK (both legs or none, union = activities), the stale-writer rule (null keeps
-- only while the legs still add up, {} clears), the views, the `tour_type` suggestion value and
-- apply, and that the legs are a meaningful change. Patrick and Jakob are accepted friends in
-- the seed; Jakob is no partner of the test tour.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db

\set ON_ERROR_STOP on

\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'
\set tour 'dddddddd-0000-0000-0000-000000000031'

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.create_tour_full(
  p_id := :'tour', p_name := 'Brienzer Rothorn', p_goal := 'POINT(8.0475 46.7869)',
  p_tour_types := array['paragliding', 'hiking'],
  p_ascent_types := array['hiking'], p_descent_types := array['paragliding']
);
reset role;
select is((select array[ascent_types, descent_types] from public.tours where id = :'tour'),
  array[array['hiking'], array['paragliding']], '1 a hike & fly stores the way up and the way down');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select throws_ok(
  format($$select public.create_tour_full(p_id := gen_random_uuid(), p_name := 'X', p_goal := 'POINT(8 46)',
    p_tour_types := array['hiking'], p_ascent_types := array['hiking'], p_descent_types := array['paragliding'])$$),
  '23514', null, '2 legs that are not the activities'' union are rejected');
select throws_ok(
  format($$select public.create_tour_full(p_id := gen_random_uuid(), p_name := 'X', p_goal := 'POINT(8 46)',
    p_tour_types := array['hiking'], p_ascent_types := array['hiking'], p_descent_types := '{}')$$),
  '23514', null, '3 one leg without the other is rejected');

-- A stale client (no leg arguments) editing the tour.
select public.update_tour_full(
  p_id := :'tour', p_name := 'Brienzer Rothorn', p_goal := 'POINT(8.0475 46.7869)',
  p_tour_types := array['paragliding', 'hiking']
);
reset role;
select is((select ascent_types from public.tours where id = :'tour'), array['hiking'],
  '4 an update without legs and with the same activities keeps them');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select is((select array[ascent_types, descent_types] from public.friend_tours_view where id = :'tour'),
  array[array['hiking'], array['paragliding']], '5 a friend sees the legs');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select is(public.tour_field_value(:'tour', 'tour_type'),
  '{"types": ["paragliding", "hiking"], "ascent": ["hiking"], "descent": ["paragliding"]}'::jsonb,
  '6 a split tour''s activities serialize with their legs');
select is(jsonb_typeof(public.tour_field_value('cccccccc-0000-0000-0000-000000000001', 'tour_type')), 'array',
  '7 an unsplit tour''s activities serialize as before');
select public.update_tour_full(
  p_id := :'tour', p_name := 'Brienzer Rothorn', p_goal := 'POINT(8.0475 46.7869)',
  p_tour_types := array['paragliding', 'hiking', 'mountain-biking']
);
reset role;
select ok((select ascent_types is null and descent_types is null from public.tours where id = :'tour'),
  '8 an update without legs that changes the activities clears them');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.update_tour_full(
  p_id := :'tour', p_name := 'Brienzer Rothorn', p_goal := 'POINT(8.0475 46.7869)',
  p_tour_types := array['paragliding', 'hiking'],
  p_ascent_types := array['hiking'], p_descent_types := array['hiking', 'paragliding']
);
select public.update_tour_full(
  p_id := :'tour', p_name := 'Brienzer Rothorn', p_goal := 'POINT(8.0475 46.7869)',
  p_tour_types := array['paragliding', 'hiking'], p_ascent_types := '{}', p_descent_types := '{}'
);
reset role;
select is((select ascent_types from public.tours where id = :'tour'), null, '9 empty legs clear the split');

-- Suggestions: an object sets the legs, an array keeps them only while they add up.
-- One pending suggestion per field: each one is applied and removed before the next.
insert into public.tour_suggestion (id, tour_id, owner_id, suggester_id, batch_id, field, value)
values ('eeeeeeee-0000-0000-0000-000000000031', :'tour', :'patrick', :'jakob', gen_random_uuid(), 'tour_type',
  '{"types": ["paragliding", "climbing"], "ascent": ["climbing"], "descent": ["paragliding"]}');
select public.fn_apply_tour_suggestion('eeeeeeee-0000-0000-0000-000000000031', null);
select is((select array[tour_types::text, ascent_types::text, descent_types::text] from public.tours where id = :'tour'),
  array['{paragliding,climbing}', '{climbing}', '{paragliding}'],
  '10 an accepted climb & fly suggestion sets the activities and their legs');
delete from public.tour_suggestion where tour_id = :'tour';
insert into public.tour_suggestion (id, tour_id, owner_id, suggester_id, batch_id, field, value)
values ('eeeeeeee-0000-0000-0000-000000000032', :'tour', :'patrick', :'jakob', gen_random_uuid(), 'tour_type',
  '["climbing", "paragliding"]');
select public.fn_apply_tour_suggestion('eeeeeeee-0000-0000-0000-000000000032', null);
select is((select descent_types from public.tours where id = :'tour'), array['paragliding'],
  '11 an array with the same activities keeps the legs');
delete from public.tour_suggestion where tour_id = :'tour';
insert into public.tour_suggestion (id, tour_id, owner_id, suggester_id, batch_id, field, value)
values ('eeeeeeee-0000-0000-0000-000000000033', :'tour', :'patrick', :'jakob', gen_random_uuid(), 'tour_type',
  '["hiking"]');
select public.fn_apply_tour_suggestion('eeeeeeee-0000-0000-0000-000000000033', null);
select ok((select ascent_types is null and descent_types is null from public.tours where id = :'tour'),
  '12 an array with other activities clears the legs');

select ok(
  (select public.fn_is_meaningful_tour_change(t,
     jsonb_populate_record(t, '{"tour_types": ["hiking", "paragliding"], "ascent_types": ["hiking"], "descent_types": ["paragliding"]}'), false)
     from public.tours t where t.id = :'tour'),
  '13 a change of legs is meaningful');

select * from finish();
rollback;
