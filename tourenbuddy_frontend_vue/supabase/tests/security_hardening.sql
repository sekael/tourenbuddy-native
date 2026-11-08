-- Regression checks for 20261012144059_security_hardening.sql and
-- 20261013083452_tour_partner_ids_lockdown.sql: each assertion is a hole that was open before. Impersonation as in the other suites (authenticated / anon role +
-- request.jwt.claims sub); rolled back, so the local seed is untouched.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db

\set ON_ERROR_STOP on

\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'
\set reni '33333333-3333-3333-3333-333333333333'
\set selim '44444444-4444-4444-4444-444444444444'

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- Seed: Patrick 1111 owns tours ...01 (no partners) and ...02 (partner Jakob); Jakob 2222 and
-- Selim 4444 are Patrick's friends (Selim partners on nothing); Reni 3333 has a pending
-- request to Patrick.

-- 1 — tours_view is no longer a definer view open to anon.
set local role anon;
select throws_ok($$select 1 from public.tours_view$$, '42501', null, '1a anon cannot read tours_view');
select throws_ok($$delete from public.tours_view$$, '42501', null, '1b anon cannot delete through tours_view');
reset role;

-- 2 — The owner surface holds only the caller's tours, never a friend's.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.tours_view where user_id <> auth.uid()), 0,
  '2 tours_view never returns other users'' tours');

-- 3 — Internal definer helpers are not client-callable.
select throws_ok(
  $$select public.terminate_pending_and_friendship_between(
      '11111111-1111-1111-1111-111111111111', array['22222222-2222-2222-2222-222222222222']::uuid[])$$,
  '42501', null, '3a terminate_pending_and_friendship_between not callable');
select throws_ok(
  $$select public.fn_apply_tour_suggestion(gen_random_uuid(), null)$$,
  '42501', null, '3b fn_apply_tour_suggestion not callable');

-- 4 — tour_field_value reveals detail only to owner / partner-friend.
select ok(
  public.tour_field_value('cccccccc-0000-0000-0000-000000000001', 'dates') is null
  and public.tour_field_value('cccccccc-0000-0000-0000-000000000002', 'dates') is not null,
  '4 tour_field_value gated to partner-friends');

-- 5 — No attachment rows on someone else's tour.
select throws_ok(
  $$insert into public.tour_attachments (tour_id, user_id, storage_path, mime_type, size_bytes, original_filename)
    values ('cccccccc-0000-0000-0000-000000000001', auth.uid(), auth.uid() || '/x.pdf', 'application/pdf', 1, 'x.pdf')$$,
  '42501', 'new row violates row-level security policy for table "tour_attachments"',
  '5 attachment on a foreign tour rejected');
reset role;

-- 6 — A recipient may only deny directly, and never rewrite the parties.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select throws_ok(
  $$update public.friend_requests set status = 'denied', from_user_id = '22222222-2222-2222-2222-222222222222'
    where from_user_id = '33333333-3333-3333-3333-333333333333'$$,
  '42501', null, '6a party columns not writable');

-- 7 — The owner's own attachment upload works again (cap trigger lock).
select lives_ok(
  $$insert into public.tour_attachments (tour_id, user_id, storage_path, mime_type, size_bytes, original_filename)
    values ('cccccccc-0000-0000-0000-000000000001', auth.uid(), auth.uid() || '/x.pdf', 'application/pdf', 1, 'x.pdf')$$,
  '7 owner attachment insert succeeds');
reset role;

-- 8 — The partner roster is internal; callers learn only whether THEY are a partner.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'selim', 'role', 'authenticated')::text, true);
select throws_ok(
  $$select public.tour_partner_user_ids('cccccccc-0000-0000-0000-000000000002')$$,
  '42501', null, '8a tour_partner_user_ids not client-callable');
select ok(not public.is_tour_partner('cccccccc-0000-0000-0000-000000000002'),
  '8b is_tour_partner false for a non-partner friend');
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select ok(public.is_tour_partner('cccccccc-0000-0000-0000-000000000002'),
  '8c is_tour_partner true for the partner');
reset role;

-- Definer / cron callers (no JWT) still resolve the full roster.
select set_config('request.jwt.claims', '', true);
select ok(:'jakob'::uuid = any (public.tour_partner_user_ids('cccccccc-0000-0000-0000-000000000002')),
  '8d roster resolves for internal callers without a JWT');

select * from finish();
rollback;
