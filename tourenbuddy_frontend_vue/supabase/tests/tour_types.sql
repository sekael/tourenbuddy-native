-- Multiple activity types per tour (change: multi-activity-tours, #335).
--
-- Pins the overlap semantics of the tour-link predicate, the eviction rule on type edits and
-- the stale-client compat path of the write RPCs (`p_tour_type`). Patrick and Jakob are
-- accepted friends in the seed; the test tours sit far from every seed tour.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db

\set ON_ERROR_STOP on

\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.create_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000001', p_name := 'Ski or hike',
  p_goal := 'POINT(7.0 46.0)', p_tour_types := array['skitour', 'hiking']
);
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
-- A stale (pre-#335) client only knows the single-type argument.
select public.create_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000002', p_name := 'Hike',
  p_goal := 'POINT(7.0005 46.0)', p_tour_type := 'hiking'
);
select public.create_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000003', p_name := 'Untyped',
  p_goal := 'POINT(7.0005 46.0)'
);
reset role;

select is((select tour_types from public.tours where id = 'dddddddd-0000-0000-0000-000000000002'),
  array['hiking'], '1 stale create stores a one-element list');
select is((select tour_types from public.tours where id = 'dddddddd-0000-0000-0000-000000000003'),
  '{}'::text[], '2 omitted types store an empty list');
select ok(public.fn_collision_predicate('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002'),
  '3 one shared activity is the same objective');
select ok(not public.fn_collision_predicate('dddddddd-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000003'),
  '4 an untyped tour matches nothing');

insert into public.tour_link_group (id) values ('eeeeeeee-0000-0000-0000-000000000001');
insert into public.tour_link_member (group_id, tour_id) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001'),
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
-- Stale client toggling completion echoes the primary type only.
select public.update_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000001', p_name := 'Ski or hike',
  p_goal := 'POINT(7.0 46.0)', p_tour_type := 'skitour', p_completed := true
);
reset role;
select is((select tour_types from public.tours where id = 'dddddddd-0000-0000-0000-000000000001'),
  array['skitour', 'hiking'], '5 stale echo of the primary type keeps every type');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.update_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000001', p_name := 'Ski or hike',
  p_goal := 'POINT(7.0 46.0)', p_tour_types := array['skitour', 'hiking', 'climbing']
);
reset role;
select ok(exists (select 1 from public.tour_link_member where tour_id = 'dddddddd-0000-0000-0000-000000000001'),
  '6 adding an activity keeps the link');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.update_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000001', p_name := 'Ski or hike',
  p_goal := 'POINT(7.0 46.0)', p_tour_types := array['skitour']
);
reset role;
select ok(not exists (select 1 from public.tour_link_member where tour_id = 'dddddddd-0000-0000-0000-000000000001'),
  '7 dropping the only shared activity evicts');

select throws_ok(
  $$update public.tours set tour_types = array['swimming'] where id = 'dddddddd-0000-0000-0000-000000000001'$$,
  '23514', null, '8 an unknown activity is rejected'
);

select * from finish();
rollback;
