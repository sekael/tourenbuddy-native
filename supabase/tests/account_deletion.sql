-- Account deletion: cascade, anonymized reports, silence (change: add-native-backend, D5).
--
-- The Worker deletes the auth user through GoTrue's admin API, which runs without a JWT, so
-- `auth.uid()` is null in every trigger. This suite deletes Jakob the same way.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db
--
-- Seed identities (supabase/seed.sql): Patrick 1111 (friend of Jakob, partner on Jakob's
-- tour ...03), Jakob 2222 (owner of ...03, partner on Patrick's ...02), Reni 3333.

\set ON_ERROR_STOP on
\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'
\set reni '33333333-3333-3333-3333-333333333333'

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

delete from public.notifications;
delete from public.abuse_reports;

-- Jakob's footprint beyond the seed: a link between his tour and Patrick's, reports both
-- ways, a device token, a suggestion on Patrick's tour.
insert into public.tour_link_group (id) values ('dddddddd-0000-0000-0000-000000000001');
insert into public.tour_link_member (group_id, tour_id) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002'),
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000003');
insert into public.abuse_reports (reporter_user_id, reported_user_id, reason) values
  (:'jakob', :'reni', 'spam'),
  (:'reni', :'jakob', 'rude');
insert into public.device_push_tokens (user_id, platform, token, app_id, apns_environment)
  values (:'jakob', 'ios', 'jakob-phone', 'ch.tourenbuddy.app', 'production');
insert into public.tour_suggestion (tour_id, owner_id, suggester_id, batch_id, field, value)
  values ('cccccccc-0000-0000-0000-000000000002', :'patrick', :'jakob', gen_random_uuid(), 'name', '"Gfroren"');

-- The Worker lists the objects to delete first; clients may not call that function.
insert into storage.objects (bucket_id, name) values
  ('tour-gpx', :'jakob' || '/cccccccc-0000-0000-0000-000000000003.gpx'),
  ('tour-attachments', :'jakob' || '/cccccccc-0000-0000-0000-000000000003/a.pdf'),
  ('tour-attachments', :'patrick' || '/cccccccc-0000-0000-0000-000000000002/b.pdf');
select results_eq(
  $$ select bucket_id || ':' || split_part(name, '/', 3) from public.account_storage_objects('22222222-2222-2222-2222-222222222222') $$,
  $$ values ('tour-attachments:a.pdf'), ('tour-gpx:') $$,
  'every object under the user prefix in both buckets, nested ones included, nobody else''s'
);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select throws_ok(
  $$ select * from public.account_storage_objects('11111111-1111-1111-1111-111111111111') $$,
  '42501', null, 'clients cannot list anyone''s objects'
);
reset role;

-- The deletion, as GoTrue's admin API runs it: no JWT claims.
select set_config('request.jwt.claims', '', true);
delete from auth.users where id = :'jakob';

select is((select count(*)::int from public.user_profile where id = :'jakob'), 0, 'profile gone');
select is((select count(*)::int from public.tours where user_id = :'jakob'), 0, 'tours gone');
select is(
  (select count(*)::int from public.tour_partners tp join public.contacts c on c.id = tp.contact_id
    where c.user_id = :'jakob' or tp.user_id = :'jakob'),
  0, 'partner rows of and on his tours gone'
);
select is(
  (select count(*)::int from public.friendships where :'jakob' in (request_user_id, response_user_id)),
  0, 'friendships gone'
);
select is((select count(*)::int from public.contacts where user_id = :'jakob'), 0, 'contacts gone');
select is((select count(*)::int from public.device_push_tokens where user_id = :'jakob'), 0, 'device tokens gone');
select is((select count(*)::int from public.tour_suggestion where :'jakob' in (owner_id, suggester_id)), 0, 'suggestions gone');
select is(
  (select count(*)::int from public.tour_link_group where id = 'dddddddd-0000-0000-0000-000000000001'),
  0, 'a link left with one member dissolves'
);
select is(
  (select count(*)::int from public.abuse_reports where reporter_user_id is null or reported_user_id is null),
  2, 'both reports survive'
);
select is((select count(*)::int from public.abuse_reports where :'jakob' in (reporter_user_id, reported_user_id)), 0, 'reports anonymized');
select is((select count(*)::int from public.notifications), 0, 'nobody is notified');
select is(
  (select count(*)::int from public.tours where id in ('cccccccc-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002')),
  2, 'the friend keeps his own tours'
);

select * from finish();
rollback;
