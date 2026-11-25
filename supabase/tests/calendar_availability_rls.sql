-- RLS + RPC verification for calendar availability sync (change: calendar-availability-sync).
--
-- Same mechanism as tour_suggestion_rls.sql: impersonate seed users via the `authenticated`
-- role + request.jwt.claims sub, wrapped in a transaction and rolled back.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db
--
-- Seed identities: Patrick 1111 (owner), Jakob 2222 (friend), Reni 3333 (NOT a friend).
-- Dates in 2030 so seed availability never collides.

\set ON_ERROR_STOP on

\set owner '11111111-1111-1111-1111-111111111111'
\set friend '22222222-2222-2222-2222-222222222222'
\set stranger '33333333-3333-3333-3333-333333333333'

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- 1 — No feed: mark + clear leaves no row (plain delete, no tombstone).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
select public.apply_availability_diff('{2030-01-01}', '{}');
select public.apply_availability_diff('{}', '{2030-01-01}');
select ok(
  not exists (select 1 from public.user_availability where date = '2030-01-01'),
  '1 no tombstone without a feed');

-- 2 — With a feed: clear writes a tombstone; mark writes source = manual.
insert into public.user_calendar_feeds (user_id, url) values (:'owner', 'https://cal.example/a.ics');
select public.apply_availability_diff('{2030-01-02,2030-01-04}', '{}');
select public.apply_availability_diff('{}', '{2030-01-02}');
select ok(
  (select not available and source = 'manual' from public.user_availability where date = '2030-01-02'),
  '2 clear with a feed tombstones');

-- 3 — Sixth feed rejected with the named exception.
insert into public.user_calendar_feeds (user_id, url)
select auth.uid(), 'https://cal.example/' || g || '.ics' from generate_series(1, 4) g;
select throws_like(
  $$insert into public.user_calendar_feeds (user_id, url) values (auth.uid(), 'https://cal.example/6.ics')$$,
  'calendar_feed_limit_exceeded%',
  '3 sixth feed rejected');
delete from public.user_calendar_feeds where url <> 'https://cal.example/a.ics';

-- 4 — An unsatisfiable window (04:00–12:00 + 481 min) is rejected.
select throws_ok(
  $$insert into public.user_calendar_settings (user_id, core_start, core_end, min_free_minutes)
    values (auth.uid(), '04:00', '12:00', 481)$$,
  '23514', null,
  '4 unsatisfiable window rejected');
insert into public.user_calendar_settings (user_id) values (:'owner');

-- 5 — authenticated cannot call the service-role sync RPC.
select throws_ok(
  $$select public.apply_calendar_availability(auth.uid(), '2030-01-01', '2030-01-10', '{}')$$,
  '42501', null,
  '5 sync RPC is service-role only');
reset role;

-- Owner's availability from 2030 on, as `date:available:source` in date order.
create function pg_temp.owner_days() returns text
  language sql as $$
  select string_agg(date || ':' || available || ':' || source, ',' order by date)
  from public.user_availability
  where user_id = '11111111-1111-1111-1111-111111111111' and date >= '2030-01-01'
$$;

-- 6 — Sync never touches manual rows (tombstone 02, manual 04), and removes stale calendar rows.
select public.apply_calendar_availability(
  :'owner', '2030-01-01', '2030-01-10', '{2030-01-02,2030-01-03,2030-01-04,2030-03-01}');
select is(
  pg_temp.owner_days(),
  '2030-01-02:false:manual,2030-01-03:true:calendar,2030-01-04:true:manual',
  '6a manual rows survive, out-of-horizon day not written');

-- Rogue call spanning manual days with an empty set: only the calendar row goes.
select public.apply_calendar_availability(:'owner', '2030-01-01', '2030-01-10', '{}');
select is(
  pg_temp.owner_days(),
  '2030-01-02:false:manual,2030-01-04:true:manual',
  '6b empty sync removes only calendar rows');

-- 7 — A friend cannot select the owner's tombstone directly.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'friend', 'role', 'authenticated')::text, true);
select ok(
  exists (select 1 from public.user_availability where user_id = :'owner' and date = '2030-01-04'),
  '7a friend sees manual available day (policy not too tight)');
select ok(
  not exists (select 1 from public.user_availability where user_id = :'owner' and not available),
  '7b tombstone hidden from friend');

-- 8 — A non-owner cannot read either new table.
select set_config('request.jwt.claims', json_build_object('sub', :'stranger', 'role', 'authenticated')::text, true);
select ok(
  not exists (select 1 from public.user_calendar_feeds where user_id = :'owner')
  and not exists (select 1 from public.user_calendar_settings where user_id = :'owner'),
  '8 feeds/settings owner-only');
reset role;

-- 9 — Deleting the last feed leaves exactly the manual available days.
select public.apply_calendar_availability(:'owner', '2030-01-01', '2030-01-10', '{2030-01-05}');
delete from public.user_calendar_feeds where user_id = :'owner';
select is(pg_temp.owner_days(), '2030-01-04:true:manual', '9 last feed removal returns to manual-only');

select * from finish();
rollback;
