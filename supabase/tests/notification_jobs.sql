-- Inbox jobs + release notes (change: inbox-availability-release-notes).
--
-- Separate from notifications_rls.sql because that file unfriends/blocks seed users
-- mid-run; these cases need the seed's Patrick <-> Jakob shared tours intact.
-- Dates are relative to current_date because the jobs are. Rolled back at the end.
--
-- pgTAP. Assumes pristine seed data:
--   supabase db reset && supabase test db
--
-- Seed: Patrick 1111 owns friends-visible ...02 (partner Jakob); Jakob 2222 owns ...03
-- (partner Patrick); Selim 4444 is Patrick's friend without a shared tour; Patrick owns
-- solo tour ...01.

\set ON_ERROR_STOP on

begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

delete from public.notifications;
delete from public.user_availability;

\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'
\set selim '44444444-4444-4444-4444-444444444444'
\set t01 'cccccccc-0000-0000-0000-000000000001'
\set t02 'cccccccc-0000-0000-0000-000000000002'
\set t03 'cccccccc-0000-0000-0000-000000000003'

create function pg_temp.n(p_recipient uuid, p_type text) returns int
  language sql as $$
  select count(*)::int from public.notifications where recipient_id = p_recipient and type = p_type
$$;

-- =====================================================================
-- 1. Type check (D5)
-- =====================================================================
set local role service_role;
select lives_ok(
  $$insert into public.notifications (recipient_id, type, action) values
    ('44444444-4444-4444-4444-444444444444', 'availability', 'weekly'),
    ('44444444-4444-4444-4444-444444444444', 'tour_reminders', 'upcoming'),
    ('44444444-4444-4444-4444-444444444444', 'release_notes', 'published')$$,
  '1a new types accepted');
select throws_ok(
  $$insert into public.notifications (recipient_id, type, action)
    values ('44444444-4444-4444-4444-444444444444', 'bogus', 'x')$$,
  '23514', null,
  '1b unknown type rejected');
reset role;
delete from public.notifications;

-- =====================================================================
-- 2. Weekly availability summary (D1, D2)
-- =====================================================================
-- Only ...02 counts at first (Patrick owns, Jakob partner): Patrick is "partner on own
-- tour", Jakob is "partner on friend's tour".
update public.tours set completed = true where id = :'t03';

insert into public.user_availability (user_id, date, available, source) values
  (:'patrick', current_date + 2, true,  'manual'),
  (:'jakob',   current_date + 2, true,  'manual'),
  (:'patrick', current_date + 3, true,  'calendar'),
  (:'jakob',   current_date + 3, true,  'manual'),
  (:'patrick', current_date + 4, false, 'manual'),   -- tombstone
  (:'jakob',   current_date + 4, true,  'manual'),
  (:'patrick', current_date + 8, true,  'manual'),   -- next week
  (:'jakob',   current_date + 8, true,  'manual'),
  (:'selim',   current_date + 2, true,  'manual');   -- friend, no shared tour

-- Last week's summaries, read and unread.
insert into public.notifications (recipient_id, type, action, ref, read_at) values
  (:'selim', 'availability', 'weekly', jsonb_build_object('week_start', current_date - 7), null),
  (:'selim', 'availability', 'weekly', jsonb_build_object('week_start', current_date - 7), now());

select public.fn_weekly_availability_summary();

select ok(pg_temp.n(:'patrick', 'availability') = 1, '2a owner gets one summary');
select ok(pg_temp.n(:'jakob', 'availability') = 1, '2b partner on friend''s tour gets one summary');
select is(
  (select ref->'friend_ids' from public.notifications where recipient_id = :'patrick'::uuid),
  jsonb_build_array(:'jakob'),
  '2c friend without shared tour not listed');
select is(
  (select ref->'dates' from public.notifications where recipient_id = :'patrick'::uuid),
  jsonb_build_array(current_date + 2, current_date + 3),
  '2d manual + calendar days listed; tombstone and next week not');
select ok(
  (select actor_id is null and action = 'weekly' and ref->>'week_start' = current_date::text
   from public.notifications where recipient_id = :'patrick'::uuid),
  '2e actor-less, week_start set');
select ok(pg_temp.n(:'selim', 'availability') = 0, '2f last week''s summaries deleted, read or not');

select public.fn_weekly_availability_summary();
select ok(
  (select count(*) from public.notifications where type = 'availability') = 2,
  '2g second run records nothing');

-- Private shared tour.
delete from public.notifications;
update public.tours set visibility = 'private' where id = :'t02';
select public.fn_weekly_availability_summary();
select ok(
  (select count(*) from public.notifications where type = 'availability') = 0,
  '2h private tour does not make a friend eligible');

-- Completed shared tour.
update public.tours set visibility = 'friends', completed = true where id = :'t02';
select public.fn_weekly_availability_summary();
select ok(
  (select count(*) from public.notifications where type = 'availability') = 0,
  '2i completed tour does not make a friend eligible');

-- Mirror direction: Jakob owns ...03 with Patrick as partner.
update public.tours set completed = false where id = :'t03';
select public.fn_weekly_availability_summary();
select ok(
  pg_temp.n(:'patrick', 'availability') = 1 and pg_temp.n(:'jakob', 'availability') = 1,
  '2j friend-owned tour gates both ways');

-- Only overlap next week.
delete from public.notifications;
delete from public.user_availability where date < current_date + 7;
select public.fn_weekly_availability_summary();
select ok(
  (select count(*) from public.notifications where type = 'availability') = 0,
  '2k overlap outside the week records nothing');

update public.tours set completed = false where id = :'t02';
delete from public.notifications;

-- =====================================================================
-- 3. Tour reminders (D3)
-- =====================================================================
update public.tours set planned_date = current_date + 5 where id = :'t02';
update public.tours set planned_date = current_date + 4 where id = :'t01';
update public.tours set planned_date = current_date + 6, end_date = null where id = :'t03';

-- A reminder for ...02's previous date: the moved date must remind again.
insert into public.notifications (recipient_id, type, action, tour_id, ref)
values (:'patrick', 'tour_reminders', 'upcoming', :'t02',
        jsonb_build_object('planned_date', current_date + 9));

select public.fn_tour_reminders();

select ok(
  (select count(*) from public.notifications
   where recipient_id = :'patrick'::uuid and tour_id = :'t02'::uuid
     and ref->>'planned_date' = (current_date + 5)::text) = 1,
  '3a owner reminded; moved date reminds again');
select ok(
  (select count(*) from public.notifications where recipient_id = :'jakob'::uuid and tour_id = :'t02'::uuid) = 1,
  '3b friend partner reminded');
select ok(
  (select actor_id is null and action = 'upcoming' and tour_name = 'Gfroren Hora'
   from public.notifications where recipient_id = :'jakob'::uuid),
  '3c actor-less, tour named');
select ok(
  (select count(*) from public.notifications where tour_id in (:'t01'::uuid, :'t03'::uuid)) = 0,
  '3d 4 and 6 days ahead not reminded');

select public.fn_tour_reminders();
select ok(
  (select count(*) from public.notifications where type = 'tour_reminders') = 3,
  '3e second run records nothing');

-- Private: owner only. Completed: nobody.
delete from public.notifications;
update public.tours set visibility = 'private' where id = :'t02';
update public.tours set planned_date = current_date + 5, completed = true where id = :'t03';
select public.fn_tour_reminders();
select ok(
  pg_temp.n(:'patrick', 'tour_reminders') = 1 and pg_temp.n(:'jakob', 'tour_reminders') = 0,
  '3f private tour reminds owner only; completed tour reminds nobody');

-- Partner who is no longer the owner's friend.
delete from public.notifications;
update public.tours set visibility = 'friends' where id = :'t02';
delete from public.friendships
where (request_user_id = :'patrick' and response_user_id = :'jakob')
   or (request_user_id = :'jakob' and response_user_id = :'patrick');
select public.fn_tour_reminders();
select ok(
  pg_temp.n(:'patrick', 'tour_reminders') = 1 and pg_temp.n(:'jakob', 'tour_reminders') = 0,
  '3g non-friend partner not reminded');

select ok(
  (select count(*) from cron.job
   where (jobname, schedule) in (('weekly-availability-summary', '0 5 * * 1'), ('tour-reminders', '0 5 * * *'))) = 2,
  '3h both jobs scheduled');

-- =====================================================================
-- 4. Release notes (D7)
-- =====================================================================
delete from public.notifications;
update auth.users set created_at = current_date - 30 where id = :'patrick';

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);

select ok(public.record_release_note('note-a', current_date - 1), '4a first call records');
select ok(not public.record_release_note('note-a', current_date - 1), '4b second call records nothing');
delete from public.notifications where type = 'release_notes';
select ok(not public.record_release_note('note-a', current_date - 1), '4c deleted entry stays deleted');
select ok(public.record_release_note('note-b', current_date - 1), '4d a different note records');
select ok(not public.record_release_note('note-a', current_date - 1), '4d2 an older note after a newer one records nothing');
select ok(not public.record_release_note('note-z', current_date - 2), '4d3 an earlier-dated note records nothing');
select ok(not public.record_release_note('note-c', current_date - 31), '4e account newer than the note gets none');
select throws_ok(
  $$select public.record_release_note('Bad Id!', current_date)$$,
  '22023', null,
  '4f malformed id rejected');
select throws_ok(
  $$select * from public.user_release_note_state$$,
  '42501', null,
  '4g marker table closed to clients');
select is(
  (select count(*)::int from public.notifications),
  1,
  '4h caller sees only the one live entry');
reset role;

select ok(
  (select type = 'release_notes' and action = 'published' and actor_id is null
     and ref->>'note_id' = 'note-b' and recipient_id = :'patrick'::uuid
   from public.notifications),
  '4i entry is self-only and actor-less');
select ok(
  (select count(*) from public.notifications) = 1,
  '4j no entry for anyone else');

-- =====================================================================
-- 5. Release notes never dispatch (D8)
-- =====================================================================
select ok(
  (select pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_dispatch_notification')
    like '%WHEN ((new.type <> ''release_notes''::text))%',
  '5 dispatch trigger skips release notes');

select * from finish();
rollback;
