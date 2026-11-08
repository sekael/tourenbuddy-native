-- RLS verification for friend tour visibility (change: friend-tour-visibility).
--
-- Exercises the two-layer authz against seed data by impersonating users through
-- the `authenticated` role + a request.jwt.claims sub (the same mechanism PostgREST
-- uses, so auth.uid() resolves). Wrapped in a transaction and rolled back, so the
-- local seed is left untouched.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db

\set ON_ERROR_STOP on

\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'
\set reni '33333333-3333-3333-3333-333333333333'

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

-- Seed identities (see supabase/seed.sql)
--   Patrick 1111 (owner), Jakob 2222 (friend + partner on tour ...02),
--   Reni 3333 (pending only, NOT a friend), Selim 4444 (friend, non-partner).
--   Tour ...01 Büelehora: no partners.  Tour ...02 Gfroren Hora: partner = Jakob.

-- Impersonate a user: switch to the authenticated role and set the JWT sub.
-- reset role (back to superuser) between scenarios for setup/teardown mutations.

-- 4.1 — Non-friend (Reni, pending only) gets zero rows from the friend view.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'reni', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.friend_tours_view), 0, '4.1 non-friend sees zero friend tours');
reset role;

-- 4.3a — Friend (Jakob) sees both of Patrick's friends-visible tours.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.friend_tours_view), 2, '4.3a friend sees both friends-visible tours');

-- 4.3b — Partner friend (Jakob on tour ...02) gets full detail (planned_date present).
--        Regression guard: partner roster must resolve to profile names, not [].
select ok(
  (select is_partner and planned_date is not null and json_array_length(partner_names) > 0
   from public.friend_tours_view where id = 'cccccccc-0000-0000-0000-000000000002'),
  '4.3b partner friend sees ungated detail + partner names');

-- 4.3c — Non-partner friend (Jakob on tour ...01) gets gated columns.
select ok(
  (select not is_partner and planned_date is null
   from public.friend_tours_view where id = 'cccccccc-0000-0000-0000-000000000001'),
  '4.3c non-partner friend sees gated columns');
reset role;

-- 4.2 — Private tour is invisible even to a marked partner friend.
update public.tours set visibility = 'private' where id = 'cccccccc-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select ok(
  not exists (select 1 from public.friend_tours_view where id = 'cccccccc-0000-0000-0000-000000000002'),
  '4.2 private tour hidden from partner friend');
reset role;

-- 4.4 — Removing the friendship revokes all read access.
delete from public.friendships
where request_user_id = :'patrick' and response_user_id = :'jakob';
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.friend_tours_view), 0, '4.4 removing friendship revokes access');
reset role;

select * from finish();
rollback;
