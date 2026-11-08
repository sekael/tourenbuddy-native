-- RLS + RPC authorization verification for tour suggestions (change: tour-suggestions).
--
-- Mirrors friend_tour_visibility_rls.sql: impersonates seed users through the
-- `authenticated` role + a request.jwt.claims sub (the same mechanism PostgREST uses, so
-- auth.uid() resolves), wrapped in a transaction and rolled back.
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db
--
-- Seed identities (supabase/seed.sql):
--   Patrick 1111 (owner), Jakob 2222 (friend + partner on tour ...02),
--   Reni 3333 (pending only, NOT a friend), Selim 4444 (friend, non-partner).
--   Tour ...01 Büelehora: no partners.  Tour ...02 Gfroren Hora: partner = Jakob.

\set ON_ERROR_STOP on

\set owner '11111111-1111-1111-1111-111111111111'
\set partner '22222222-2222-2222-2222-222222222222'
\set stranger '33333333-3333-3333-3333-333333333333'
\set nonpartner '44444444-4444-4444-4444-444444444444'
\set tour 'cccccccc-0000-0000-0000-000000000002'
\set batch 'dddddddd-0000-0000-0000-000000000001'

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

-- 1 — A non-partner friend cannot create a suggestion.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'nonpartner', 'role', 'authenticated')::text, true);
select throws_ok(
  $$select public.upsert_tour_suggestions(
      'cccccccc-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001',
      '[{"field":"name","value":"Nope"}]')$$,
  '42501', null,
  '1 non-partner friend rejected');
reset role;

-- 2 — The partner CAN create, and base_value is stamped server-side from the tour.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'partner', 'role', 'authenticated')::text, true);
select public.upsert_tour_suggestions(:'tour', :'batch',
  '[{"field":"name","value":"Gfroren Hora Nordwand"},{"field":"notes","value":null}]');
select is(
  (select count(*)::int from public.tour_suggestion where batch_id = :'batch'), 2,
  '2a partner created a batch');
select ok(
  not exists (
    select 1 from public.tour_suggestion s
    where s.batch_id = :'batch' and s.field = 'name'
      and s.base_value is distinct from public.tour_field_value(s.tour_id, 'name')),
  '2b base_value stamped from the live tour');

-- 3 — A resubmit reconciles in place: one pending row per field (direct INSERT is blocked,
--     so the partial unique index is asserted through the RPC being idempotent).
select public.upsert_tour_suggestions(:'tour', :'batch',
  '[{"field":"name","value":"Revised"},{"field":"notes","value":null}]');
select is(
  (select count(*)::int from public.tour_suggestion where batch_id = :'batch' and status = 'pending'), 2,
  '3a resubmit does not duplicate rows');
select is(
  (select value #>> '{}' from public.tour_suggestion where batch_id = :'batch' and field = 'name'), 'Revised',
  '3b resubmit updates the pending value in place');

-- 4 — A field dropped from the desired set is withdrawn, not left pending.
select public.upsert_tour_suggestions(:'tour', :'batch', '[{"field":"name","value":"Revised"}]');
select is(
  (select status from public.tour_suggestion where batch_id = :'batch' and field = 'notes'), 'withdrawn',
  '4 reverted field withdrawn');

-- 5 — Direct INSERT is rejected: there is no INSERT policy at all.
select throws_ok(
  $$insert into public.tour_suggestion (tour_id, owner_id, suggester_id, batch_id, field, value)
    values ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
            '22222222-2222-2222-2222-222222222222', gen_random_uuid(), 'name', '"direct"')$$,
  '42501', null,
  '5 direct INSERT rejected by RLS');

-- 6 — The author cannot accept their own suggestion.
select throws_ok(
  $$select public.accept_tour_suggestion((select id from public.tour_suggestion
      where batch_id = 'dddddddd-0000-0000-0000-000000000001' and field = 'name'))$$,
  '42501', null,
  '6 author cannot accept');
reset role;

-- 7 — A third partner sees zero suggestion rows (pending state is owner + author only).
--     Selim is a friend but not a partner; make him a partner so the ONLY thing under
--     test is the suggestion SELECT policy, not tour visibility.
insert into public.tour_partners (tour_id, contact_id)
select :'tour'::uuid, cm.contact_id
from public.contact_methods cm
join public.contacts c on c.id = cm.contact_id
join auth.users u on u.phone = ltrim(cm.value, '+')
where c.user_id = :'owner'::uuid and u.id = :'nonpartner'::uuid and cm.method_type = 'phone'
on conflict do nothing;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'nonpartner', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.tour_suggestion_view), 0, '7 third partner sees no suggestions');
reset role;

-- 8 — The owner cannot withdraw someone else's suggestion (author-only).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
select throws_ok(
  $$select public.withdraw_tour_suggestion((select id from public.tour_suggestion
      where batch_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'pending'))$$,
  '42501', null,
  '8 owner cannot withdraw');

-- 9 — Accepting applies the value to the tour and resolves the batch.
select ok(
  public.accept_tour_suggestion((select id from public.tour_suggestion
    where batch_id = :'batch' and status = 'pending'))->'resolved_batches' ? :'batch',
  '9a accept reports batch completion');
select is(
  (select name from public.tours where id = :'tour'), 'Revised',
  '9b accepted value applied to the tour');

-- 10 — A resolved row is immutable: a second accept fails.
select throws_ok(
  $$select public.accept_tour_suggestion((select id from public.tour_suggestion
      where batch_id = 'dddddddd-0000-0000-0000-000000000001' and field = 'name'))$$,
  'P0001', null,
  '10 resolved rows are immutable');
reset role;

-- 11 — A predicate break (tour goes private) voids every pending row silently.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'partner', 'role', 'authenticated')::text, true);
select public.upsert_tour_suggestions(:'tour', 'dddddddd-0000-0000-0000-000000000002',
  '[{"field":"description","value":"Voided by the predicate break"}]');
reset role;

update public.tours set visibility = 'private' where id = :'tour'::uuid;

select is(
  (select status from public.tour_suggestion where batch_id = 'dddddddd-0000-0000-0000-000000000002'),
  'withdrawn',
  '11 predicate break voids pending suggestions');

select * from finish();
rollback;
