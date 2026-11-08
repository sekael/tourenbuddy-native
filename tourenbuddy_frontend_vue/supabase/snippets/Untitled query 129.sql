-- RLS + RPC authorization verification for tour suggestions (change: tour-suggestions).
--
-- Mirrors friend_tour_visibility_rls.sql: impersonates seed users through the
-- `authenticated` role + a request.jwt.claims sub (the same mechanism PostgREST uses, so
-- auth.uid() resolves), wrapped in a transaction and rolled back.
--
-- Run against the local stack:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/tour_suggestion_rls.sql
-- A failing assertion RAISEs and aborts with a non-zero exit code.
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

-- 1 — A non-partner friend cannot create a suggestion.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'nonpartner', 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.upsert_tour_suggestions(
      'cccccccc-0000-0000-0000-000000000002'::uuid,
      'dddddddd-0000-0000-0000-000000000001'::uuid,
      '[{"field":"name","value":"Nope"}]'::jsonb
    );
    raise exception '1 FAIL: non-partner friend was allowed to suggest';
  exception when sqlstate '42501' then
    raise notice '1 OK: non-partner friend rejected';
  end;
end $$;
reset role;

-- 2 — The partner CAN create, and base_value is stamped server-side from the tour.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'partner', 'role', 'authenticated')::text, true);
do $$
declare r record;
begin
  perform public.upsert_tour_suggestions(
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '[{"field":"name","value":"Gfroren Hora Nordwand"},{"field":"notes","value":null}]'::jsonb
  );
  select count(*) as n into r from public.tour_suggestion where batch_id = 'dddddddd-0000-0000-0000-000000000001';
  if r.n <> 2 then
    raise exception '2 FAIL: expected 2 suggestion rows, got %', r.n;
  end if;
  if exists (
    select 1 from public.tour_suggestion s
    where s.batch_id = 'dddddddd-0000-0000-0000-000000000001'
      and s.field = 'name'
      and s.base_value is distinct from public.tour_field_value(s.tour_id, 'name')
  ) then
    raise exception '2 FAIL: base_value was not stamped from the live tour';
  end if;
  raise notice '2 OK: partner created a batch with a server-stamped base';
end $$;

-- 3 — A duplicate pending row for the same field is rejected by the partial unique index
--     (direct INSERT is blocked first, so this is asserted through the RPC being
--     idempotent rather than duplicating).
do $$
begin
  perform public.upsert_tour_suggestions(
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '[{"field":"name","value":"Revised"},{"field":"notes","value":null}]'::jsonb
  );
  if (select count(*) from public.tour_suggestion
      where batch_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'pending') <> 2 then
    raise exception '3 FAIL: resubmit duplicated rows instead of reconciling';
  end if;
  if (select value #>> '{}' from public.tour_suggestion
      where batch_id = 'dddddddd-0000-0000-0000-000000000001' and field = 'name') <> 'Revised' then
    raise exception '3 FAIL: resubmit did not update the pending value in place';
  end if;
  raise notice '3 OK: resubmit reconciles, one pending row per field';
end $$;

-- 4 — A field dropped from the desired set is withdrawn, not left pending.
do $$
begin
  perform public.upsert_tour_suggestions(
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '[{"field":"name","value":"Revised"}]'::jsonb
  );
  if (select status from public.tour_suggestion
      where batch_id = 'dddddddd-0000-0000-0000-000000000001' and field = 'notes') <> 'withdrawn' then
    raise exception '4 FAIL: reverted field was not withdrawn';
  end if;
  raise notice '4 OK: reverted field withdrawn';
end $$;

-- 5 — Direct INSERT is rejected: there is no INSERT policy at all.
do $$
begin
  begin
    insert into public.tour_suggestion (tour_id, owner_id, suggester_id, batch_id, field, value)
    values (
      'cccccccc-0000-0000-0000-000000000002'::uuid,
      '11111111-1111-1111-1111-111111111111'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid,
      gen_random_uuid(), 'name', '"direct"'::jsonb
    );
    raise exception '5 FAIL: direct INSERT bypassed the definer RPCs';
  exception when insufficient_privilege then
    raise notice '5 OK: direct INSERT rejected by RLS';
  end;
end $$;

-- 6 — The author cannot accept their own suggestion.
do $$
declare v_id uuid;
begin
  select id into v_id from public.tour_suggestion
  where batch_id = 'dddddddd-0000-0000-0000-000000000001' and field = 'name';
  begin
    perform public.accept_tour_suggestion(v_id);
    raise exception '6 FAIL: author accepted their own suggestion';
  exception when sqlstate '42501' then
    raise notice '6 OK: author cannot accept';
  end;
end $$;
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
do $$
begin
  if (select count(*) from public.tour_suggestion_view) <> 0 then
    raise exception '7 FAIL: a third partner sees % suggestion rows, expected 0',
      (select count(*) from public.tour_suggestion_view);
  end if;
  raise notice '7 OK: third partner sees no suggestions';
end $$;
reset role;

-- 8 — The owner cannot withdraw someone else's suggestion (author-only).
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
do $$
declare v_id uuid;
begin
  select id into v_id from public.tour_suggestion
  where batch_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'pending';
  begin
    perform public.withdraw_tour_suggestion(v_id);
    raise exception '8 FAIL: owner withdrew the author''s suggestion';
  exception when sqlstate '42501' then
    raise notice '8 OK: owner cannot withdraw';
  end;
end $$;

-- 9 — Accepting applies the value to the tour and resolves the batch.
do $$
declare v_id uuid; v_res jsonb;
begin
  select id into v_id from public.tour_suggestion
  where batch_id = 'dddddddd-0000-0000-0000-000000000001' and status = 'pending';
  v_res := public.accept_tour_suggestion(v_id);
  if (select name from public.tours where id = 'cccccccc-0000-0000-0000-000000000002') <> 'Revised' then
    raise exception '9 FAIL: accepted value was not applied to the tour';
  end if;
  if not (v_res->'resolved_batches' ? 'dddddddd-0000-0000-0000-000000000001') then
    raise exception '9 FAIL: batch not reported fully resolved';
  end if;
  raise notice '9 OK: accept applies the field and reports batch completion';
end $$;

-- 10 — A resolved row is immutable: a second accept fails.
do $$
declare v_id uuid;
begin
  select id into v_id from public.tour_suggestion
  where batch_id = 'dddddddd-0000-0000-0000-000000000001' and field = 'name';
  begin
    perform public.accept_tour_suggestion(v_id);
    raise exception '10 FAIL: an already-resolved suggestion was accepted twice';
  exception when sqlstate 'P0001' then
    raise notice '10 OK: resolved rows are immutable';
  end;
end $$;
reset role;

-- 11 — A predicate break (tour goes private) voids every pending row silently.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'partner', 'role', 'authenticated')::text, true);
select public.upsert_tour_suggestions(
  :'tour'::uuid, 'dddddddd-0000-0000-0000-000000000002'::uuid,
  '[{"field":"description","value":"Voided by the predicate break"}]'::jsonb
);
reset role;

update public.tours set visibility = 'private' where id = :'tour'::uuid;

do $$
begin
  if exists (
    select 1 from public.tour_suggestion
    where batch_id = 'dddddddd-0000-0000-0000-000000000002' and status = 'pending'
  ) then
    raise exception '11 FAIL: pending suggestion survived the tour going private';
  end if;
  if (select status from public.tour_suggestion where batch_id = 'dddddddd-0000-0000-0000-000000000002')
     <> 'withdrawn' then
    raise exception '11 FAIL: voided row is not withdrawn';
  end if;
  raise notice '11 OK: predicate break voids pending suggestions';
end $$;

rollback;
