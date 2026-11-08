-- Outings made of segments (change: multi-activity-tours, #338, design D11–D14).
--
-- Pins the `p_outing` contract of the write RPCs (null keeps / standalone, {} clears, object
-- = segment), the CHECKs, the friend view exposure and that outing edits never notify
-- partners. Patrick and Jakob are accepted friends in the seed.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db

\set ON_ERROR_STOP on

\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'
\set outing 'ffffffff-0000-0000-0000-000000000001'

begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.create_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000011', p_name := 'Valley to hut',
  p_goal := 'POINT(7.1 46.1)', p_tour_types := array['skitour'],
  p_outing := json_build_object('id', :'outing', 'name', '  Haute Route ', 'position', 0)::jsonb
);
select public.create_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000012', p_name := 'Hut to summit',
  p_goal := 'POINT(7.12 46.1)', p_tour_types := array['skitour'],
  p_outing := json_build_object('id', :'outing', 'name', 'Haute Route', 'position', 1)::jsonb
);
-- A stale client (no p_outing) toggling completion on a segment.
select public.update_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000012', p_name := 'Hut to summit',
  p_goal := 'POINT(7.12 46.1)', p_tour_type := 'skitour', p_completed := true
);
reset role;

select is((select outing_name from public.tours where id = 'dddddddd-0000-0000-0000-000000000011'),
  'Haute Route', '1 a segment stores its outing with a trimmed name');
select is((select array[outing_id::text, outing_position::text] from public.tours where id = 'dddddddd-0000-0000-0000-000000000012'),
  array[:'outing', '1'], '2 an update without p_outing keeps the membership');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select is((select outing_id::text from public.friend_tours_view where id = 'dddddddd-0000-0000-0000-000000000011'),
  :'outing', '3 a friend sees the outing of a visible segment');
reset role;

-- Outing edits are not meaningful: no partner notification on rename / reorder.
insert into public.tour_partners (tour_id, contact_id)
select 'dddddddd-0000-0000-0000-000000000011', c.id
from public.contacts c where c.user_id = :'patrick' limit 1;
create temp table notes_before as select count(*) as n from public.notifications;
grant select on notes_before to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.update_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000011', p_name := 'Valley to hut',
  p_goal := 'POINT(7.1 46.1)', p_tour_types := array['skitour'],
  p_partner_ids := (select array_agg(contact_id) from public.tour_partners where tour_id = 'dddddddd-0000-0000-0000-000000000011'),
  p_outing := json_build_object('id', :'outing', 'name', 'Haute Route 2027', 'position', 3)::jsonb
);
reset role;
select is((select count(*) from public.notifications), (select n from notes_before),
  '4 renaming / reordering a segment records no notification');
select is((select outing_position from public.tours where id = 'dddddddd-0000-0000-0000-000000000011'),
  3, '5 the new position is stored');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.update_tour_full(
  p_id := 'dddddddd-0000-0000-0000-000000000011', p_name := 'Valley to hut',
  p_goal := 'POINT(7.1 46.1)', p_tour_types := array['skitour'], p_outing := '{}'::jsonb
);
reset role;
select ok((select outing_id is null and outing_name is null and outing_position is null
  from public.tours where id = 'dddddddd-0000-0000-0000-000000000011'),
  '6 p_outing {} makes the tour standalone');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select throws_ok(
  $$select public.create_tour_full(p_id := 'dddddddd-0000-0000-0000-000000000013', p_goal := 'POINT(7.1 46.1)',
    p_outing := '{"id": "ffffffff-0000-0000-0000-000000000002"}'::jsonb)$$,
  '23514', null, '7 a segment without a position is rejected');
select throws_ok(
  $$select public.create_tour_full(p_id := 'dddddddd-0000-0000-0000-000000000014', p_goal := 'POINT(7.1 46.1)',
    p_outing := json_build_object('id', 'ffffffff-0000-0000-0000-000000000002', 'name', repeat('x', 100), 'position', 0)::jsonb)$$,
  '23514', null, '8 an outing name of 100 characters is rejected');
select public.create_tour_full(p_id := 'dddddddd-0000-0000-0000-000000000015', p_goal := 'POINT(7.1 46.1)');
reset role;
select ok((select outing_id is null from public.tours where id = 'dddddddd-0000-0000-0000-000000000015'),
  '9 a create without p_outing is standalone');

select * from finish();
rollback;
