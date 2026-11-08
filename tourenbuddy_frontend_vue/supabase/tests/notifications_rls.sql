-- Notification inbox: RLS + emission verification (change: notification-inbox).
--
-- Mirrors tour_suggestion_rls.sql: impersonates seed users through the `authenticated`
-- role + a request.jwt.claims sub, wrapped in a transaction and rolled back. Assertions
-- run after `reset role` so they can count every user's rows.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db
--
-- Seed identities (supabase/seed.sql):
--   Patrick 1111 (owner), Jakob 2222 (friend + partner on tour ...02, owner of ...03 with
--   partner Patrick), Reni 3333 (pending request -> Patrick), Selim 4444 (friend, non-partner).
--   Tour ...01 Büelehora (hiking, no partners), ...02 Gfroren Hora (partner Jakob).

\set ON_ERROR_STOP on

begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

-- Start from an empty inbox: manual testing on the local stack leaves rows behind, and
-- every count below assumes only this run's emissions (rolled back at the end).
delete from public.notifications;

-- Count a recipient's entries for an action.
create function pg_temp.n(p_recipient uuid, p_action text) returns int
  language sql as $$
  select count(*)::int from public.notifications where recipient_id = p_recipient and action = p_action
$$;

-- Re-save a tour through update_tour_full with selected overrides (the RPC is a full-row
-- overwrite, so every untouched column is passed back as-is).
create function pg_temp.resave(
  p_id uuid,
  p_name text default null,
  p_notes text default null,
  p_completed boolean default null,
  p_visibility text default null,
  p_partner_ids uuid[] default null,
  p_seasons text[] default null,
  p_start_point text default null
) returns void
  language plpgsql as $$
declare
  t public.tours;
begin
  select * into t from public.tours where id = p_id;
  perform public.update_tour_full(
    p_id                  := t.id,
    p_planned_date        := t.planned_date,
    p_name                := coalesce(p_name, t.name),
    p_goal                := t.goal::text,
    p_partner_ids         := coalesce(
                               p_partner_ids,
                               array(select contact_id from public.tour_partners where tour_id = t.id)
                             ),
    p_tour_types          := t.tour_types,
    p_elevation           := t.elevation,
    p_gpx_filepath        := t.gpx_filepath,
    p_description         := t.description,
    p_seasons             := coalesce(p_seasons, t.seasons),
    p_start_point         := coalesce(p_start_point, t.start_point::text),
    p_end_point           := t.end_point::text,
    p_equipment           := t.equipment,
    p_notes               := coalesce(p_notes, t.notes),
    p_start_point_name    := t.start_point_name,
    p_start_point_elevation := t.start_point_elevation,
    p_end_point_name      := t.end_point_name,
    p_end_point_elevation := t.end_point_elevation,
    p_visibility          := p_visibility,
    p_completed           := p_completed,
    p_end_date            := t.end_date
  );
end;
$$;
-- Called as `authenticated`; new functions get no implicit EXECUTE (20261012144059).
grant execute on function pg_temp.resave(uuid, text, text, boolean, text, uuid[], text[], text)
  to authenticated;

\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'
\set reni '33333333-3333-3333-3333-333333333333'
\set selim '44444444-4444-4444-4444-444444444444'

-- 1 — Clients cannot forge entries.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select throws_ok(
  $$insert into public.notifications (recipient_id, type, action)
    values ('22222222-2222-2222-2222-222222222222', 'friend_requests', 'received')$$,
  '42501', null,
  '1 client insert rejected');

-- 2 — Clients cannot emit through the helper.
select throws_ok(
  $$select public.fn_emit_notification(array['22222222-2222-2222-2222-222222222222'::uuid], 'friend_requests', 'received')$$,
  '42501', null,
  '2 helper not callable by clients');

-- 3 — Direct tour writes are closed (D8); the RPC path still works.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select throws_ok(
  $$update public.tours set name = 'Direct' where id = 'cccccccc-0000-0000-0000-000000000001'$$,
  '42501', null,
  '3a direct tour update rejected');
select throws_ok(
  $$insert into public.tour_partners (tour_id, contact_id)
    values ('cccccccc-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501', null,
  '3b direct tour_partners insert rejected');

-- 4 — A meaningful edit notifies the friend partner, never the actor.
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_name := 'Gfroren Hora II');
reset role;
select ok(pg_temp.n(:'jakob', 'updated') = 1, '4a partner gets one updated entry');
select ok(
  (select count(*) from public.notifications where recipient_id = :'patrick'::uuid) = 0,
  '4b actor never notified');
select ok(
  (select actor_name from public.notifications where recipient_id = :'jakob'::uuid) = 'Patrick Tester',
  '4c actor name snapshotted');

-- 5 — An unread repeat collapses; occurrences counts it.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_name := 'Gfroren Hora III');
reset role;
select ok(
  pg_temp.n(:'jakob', 'updated') = 1
  and (select occurrences from public.notifications where recipient_id = :'jakob'::uuid and action = 'updated') = 2,
  '5 unread repeat collapses into occurrences = 2');

-- 6 — Recipient sees only own rows, may only touch read_at.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'selim', 'role', 'authenticated')::text, true);
select ok((select count(*) from public.notifications) = 0, '6a foreign rows invisible');
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select throws_ok(
  $$update public.notifications set action = 'forged'$$,
  '42501', null,
  '6b non-read_at update rejected');
update public.notifications set read_at = now();

-- 7 — A read entry never collapses: the next edit inserts a new row.
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_name := 'Gfroren Hora IV');
reset role;
select ok(pg_temp.n(:'jakob', 'updated') = 2, '7 read entry -> new row');

-- 8 — Silent edits: notes-only, going private. Completion flip notifies.
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_notes := 'bring tea');
reset role;
select ok(pg_temp.n(:'jakob', 'updated') = 0, '8a notes-only edit is silent');
set local role authenticated;
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_completed := true);
reset role;
select ok(pg_temp.n(:'jakob', 'updated') = 1, '8b completion flip notifies');
delete from public.notifications;
set local role authenticated;
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_name := 'Secret', p_visibility := 'private');
reset role;
select ok((select count(*) from public.notifications) = 0, '8c going private is silent');
update public.tours set visibility = 'friends' where id = 'cccccccc-0000-0000-0000-000000000002';

-- 8d — Seasons and start / end points are partner-facing. Optional points must not make
--      every save meaningful (st_equals(null, null) is null): a re-save without points
--      stays silent.
update public.tours set start_point = null, end_point = null
where id = 'cccccccc-0000-0000-0000-000000000002';
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_notes := 'still silent');
reset role;
select ok(pg_temp.n(:'jakob', 'updated') = 0, '8d-a re-save without start/end point is silent');
set local role authenticated;
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_seasons := array['summer']);
reset role;
select ok(pg_temp.n(:'jakob', 'updated') = 1, '8d-b seasons edit notifies');
delete from public.notifications;
set local role authenticated;
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_start_point := 'POINT(7.9 46.5)');
reset role;
select ok(pg_temp.n(:'jakob', 'updated') = 1, '8d-c start point edit notifies');

-- 9 — Newly-added partner gets `created`; a removed partner is silent.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select pg_temp.resave('cccccccc-0000-0000-0000-000000000001',
  p_partner_ids := array['aaaaaaaa-0000-0000-0000-000000000001'::uuid]);
reset role;
select ok(pg_temp.n(:'jakob', 'created') = 1, '9a newly-added partner gets created');
delete from public.notifications;
set local role authenticated;
select pg_temp.resave('cccccccc-0000-0000-0000-000000000001', p_partner_ids := '{}'::uuid[]);
reset role;
select ok((select count(*) from public.notifications) = 0, '9b removed partner is silent');

-- 10 — Solo friends-visible create scans for collisions (behaviour fix); completion-only
--      update does not re-scan.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select public.create_tour_full(
  p_id := 'cccccccc-0000-0000-0000-0000000000a1',
  p_name := 'Büelehora too',
  p_goal := '0101000020E6100000805554B4A3C6234018C9E1F574654740',
  p_tour_types := array['hiking']
);
reset role;
select ok(pg_temp.n(:'patrick', 'collision') = 1, '10a solo create notifies colliding friend');
set local role authenticated;
select pg_temp.resave('cccccccc-0000-0000-0000-0000000000a1', p_completed := true);
reset role;
select ok(
  (select occurrences from public.notifications where recipient_id = :'patrick'::uuid and action = 'collision') = 1,
  '10b completion-only update does not scan');

-- 11 — Friend requests: deny emits `responded`, cancel emits nothing.
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
update public.friend_requests set status = 'denied', responded_at = now()
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select set_config('request.jwt.claims', json_build_object('sub', :'reni', 'role', 'authenticated')::text, true);
update public.friend_requests set status = 'cancelled'
 where id = 'bbbbbbbb-0000-0000-0000-000000000003';
reset role;
select ok(pg_temp.n(:'reni', 'responded') = 1, '11a deny emits responded');
select ok(
  (select count(*) from public.notifications where recipient_id = :'selim'::uuid) = 0,
  '11b cancel emits nothing');

-- 11s — Suggestions (D16): one `submitted` per new batch, one `revised` per revision, partial
--       resolution silent, full resolution notifies the author once, authors excluded
--       from the tour_updates fanout, withdraw silent.
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select public.upsert_tour_suggestions('cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-0000000000b1',
  '[{"field":"name","value":"Suggested"}]');
select public.upsert_tour_suggestions('cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-0000000000b1',
  '[{"field":"name","value":"Suggested"},{"field":"notes","value":"tea"}]');
reset role;
select ok(
  pg_temp.n(:'patrick', 'suggestion_submitted') = 1 and pg_temp.n(:'patrick', 'suggestion_revised') = 1,
  '11s-a a revision notifies as revised, not as a new submission');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.decline_tour_suggestion(
  (select id from public.tour_suggestion where batch_id = 'dddddddd-0000-0000-0000-0000000000b1' and field = 'notes'));
reset role;
select ok(pg_temp.n(:'jakob', 'suggestion_resolved') = 0, '11s-b partial resolution is silent');
set local role authenticated;
select public.accept_tour_suggestion(
  (select id from public.tour_suggestion where batch_id = 'dddddddd-0000-0000-0000-0000000000b1' and field = 'name'));
reset role;
select ok(pg_temp.n(:'jakob', 'suggestion_resolved') = 1, '11s-c full resolution notifies the author once');
select ok(pg_temp.n(:'jakob', 'updated') = 0, '11s-d author excluded from tour_updates fanout');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select public.upsert_tour_suggestions('cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-0000000000b2',
  '[{"field":"description","value":"x"}]');
select public.withdraw_tour_suggestion(
  (select id from public.tour_suggestion where batch_id = 'dddddddd-0000-0000-0000-0000000000b2'));
reset role;
select ok(pg_temp.n(:'patrick', 'suggestion_submitted') = 2, '11s-e withdraw is silent');

-- 11l — Link requests: created -> target owner, declined -> initiator, withdraw silent.
--       Jakob's colliding tour ...a1 (test 10) vs Patrick's Büelehora ...01.
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select public.create_link_request('cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000001');
reset role;
select ok(pg_temp.n(:'patrick', 'link_created') = 1, '11l-a created notifies target owner');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.decline_link_request((select id from public.tour_link_request
  where initiator_tour_id = 'cccccccc-0000-0000-0000-0000000000a1' and status = 'pending'));
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select public.withdraw_link_request(public.create_link_request(
  'cccccccc-0000-0000-0000-0000000000a1', 'cccccccc-0000-0000-0000-000000000001'));
reset role;
select ok(pg_temp.n(:'jakob', 'link_declined') = 1, '11l-b declined notifies initiator');
select ok(pg_temp.n(:'patrick', 'link_created') = 2, '11l-c withdraw adds nothing beyond its create');

-- 12v — Losing access clears the recipient's entries for the tour; regaining starts over
--       from the next event (re-share / re-add -> `created`).
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_name := 'Visible');
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_visibility := 'private');
reset role;
select ok(
  (select count(*) from public.notifications where recipient_id = :'jakob'::uuid) = 0,
  '12v-a going private clears the partner''s entries');
set local role authenticated;
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_name := 'Suggested', p_visibility := 'friends');
reset role;
select ok(
  pg_temp.n(:'jakob', 'created') = 1
  and (select count(*) from public.notifications where recipient_id = :'jakob'::uuid) = 1,
  '12v-b re-share starts over with created');
set local role authenticated;
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002', p_partner_ids := '{}'::uuid[]);
reset role;
select ok(
  (select count(*) from public.notifications where recipient_id = :'jakob'::uuid) = 0,
  '12v-c partner removal clears the removed partner''s entries');
set local role authenticated;
select pg_temp.resave('cccccccc-0000-0000-0000-000000000002',
  p_partner_ids := array['aaaaaaaa-0000-0000-0000-000000000001'::uuid]);
reset role;
select ok(pg_temp.n(:'jakob', 'created') = 1, '12v-d re-added partner starts over with created');

-- 12 — Owner delete notifies friend partners; a service-role delete emits nothing.
delete from public.notifications;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
delete from public.tours where id = 'cccccccc-0000-0000-0000-000000000002';
reset role;
select ok(
  (select tour_name from public.notifications where recipient_id = :'jakob'::uuid and action = 'deleted') = 'Suggested',
  '12a deleted carries the name snapshot');
select ok(
  (select count(*) from public.notifications where recipient_id = :'jakob'::uuid) = 1,
  '12a-2 delete keeps only the deleted notice');
delete from public.notifications;
select set_config('request.jwt.claims', '{}', true);
delete from public.tours where id = 'cccccccc-0000-0000-0000-000000000003';
select ok((select count(*) from public.notifications) = 0, '12b service-role delete is silent');

-- 13 — A helper error never aborts the caller.
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.fn_emit_notification(array[:'jakob'::uuid], 'not_a_type', 'received');
select ok(true, '13 invalid emission did not abort');

-- 14 — Block removes the blocker's entries caused by the target.
insert into public.notifications (recipient_id, type, action, actor_id)
values (:'patrick', 'tour_updates', 'updated', :'jakob'),
       (:'patrick', 'tour_updates', 'updated', :'selim');
set local role authenticated;
select public.block_user(:'jakob');
reset role;
select ok(
  (select count(*) from public.notifications where recipient_id = :'patrick'::uuid and actor_id = :'jakob'::uuid) = 0
  and (select count(*) from public.notifications where recipient_id = :'patrick'::uuid and actor_id = :'selim'::uuid) = 1,
  '14 block removes only the target''s entries');

-- 15 — Shared browser: a second account registering a foreign endpoint takes it over.
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values (:'patrick', 'https://push.example/shared', 'k', 'a');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'selim', 'role', 'authenticated')::text, true);
select public.register_push_subscription('https://push.example/shared', 'k2', 'a2', 'test');
reset role;
select ok(
  (select user_id from public.push_subscriptions where endpoint = 'https://push.example/shared') = :'selim'::uuid,
  '15 endpoint reassigned to the registering account');

-- 16 — Retention job exists and only targets rows older than 90 days.
select ok(
  (select command from cron.job where jobname = 'purge-old-notifications') like '%interval ''90 days''%',
  '16 purge job scheduled for 90 days');

-- 17 — Unfriend clears each side's entries about the other's tours.
insert into public.notifications (recipient_id, type, action, tour_id, tour_name)
values (:'selim', 'tour_updates', 'updated', 'cccccccc-0000-0000-0000-000000000001', 'Büelehora');
delete from public.friendships
where (request_user_id = :'patrick' and response_user_id = :'selim')
   or (request_user_id = :'selim' and response_user_id = :'patrick');
select ok(
  (select count(*) from public.notifications
   where recipient_id = :'selim'::uuid and tour_id = 'cccccccc-0000-0000-0000-000000000001') = 0,
  '17 unfriend clears entries about the ex-friend''s tours');

select * from finish();
rollback;
