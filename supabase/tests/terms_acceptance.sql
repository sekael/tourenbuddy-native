-- Terms of use acceptance: record, enforcement switch, retention (change: add-terms-acceptance).
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db
--
-- Seed identities (supabase/seed.sql): Patrick 1111, Jakob 2222, Reni 3333.

\set ON_ERROR_STOP on
\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'
\set reni '33333333-3333-3333-3333-333333333333'

begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

delete from public.terms_acceptances;

-- Every base table in public carries the trigger, so a new table can't slip past enforcement.
select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname <> 'terms_acceptances'
      and not exists (
        select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'a_require_terms'
      )),
  null,
  'every public table but the record has the a_require_terms trigger'
);

-- ---- Accepting, as Patrick ----
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ select * from public.accept_terms('2020-01-01') $$,
  'P0001', 'terms_version_mismatch', 'only the version in force can be accepted'
);
select is((select count(*)::int from public.terms_acceptances), 0, 'a mismatch records nothing');

select is(
  (select accepted_version from public.accept_terms(public.terms_current_version())),
  public.terms_current_version(),
  'accepting returns the accepted version'
);
select lives_ok(
  $$ select * from public.accept_terms(public.terms_current_version()) $$,
  'accepting again is harmless'
);
select is((select count(*)::int from public.terms_acceptances), 1, 'one record per version');

select throws_ok(
  $$ insert into public.terms_acceptances (user_id, version) values (auth.uid(), '2026-11-22') $$,
  '42501', null, 'clients cannot write a record directly'
);
select throws_ok(
  $$ update public.terms_acceptances set accepted_at = now() - interval '1 year' $$,
  '42501', null, 'clients cannot change a record'
);

reset role;
select is(
  (select email || ' ' || version from public.terms_acceptances where user_id = :'patrick'),
  'patrick@tourenbuddy.ch ' || public.terms_current_version(),
  'the record holds the account email and the version'
);
select ok(
  (select accepted_at > now() - interval '1 minute' from public.terms_acceptances where user_id = :'patrick'),
  'the record holds the server time'
);

-- ---- Reni has not accepted ----
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'reni', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.terms_acceptances), 0, 'nobody reads another user''s record');
select is(
  (select accepted_version from public.terms_status()), null, 'status: nothing accepted yet'
);
select lives_ok(
  $$ insert into public.contacts (first_name) values ('QA off') $$,
  'enforcement off: a write without acceptance passes'
);

-- ---- Enforcement on (rolled back with the suite) ----
reset role;
create or replace function public.terms_enforced() returns boolean
  language sql stable set search_path = '' as $$ select true $$;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'reni', 'role', 'authenticated')::text, true);

select throws_ok(
  $$ insert into public.contacts (first_name) values ('QA on') $$,
  'P0001', 'terms_not_accepted', 'enforcement on: a direct write is refused'
);
select throws_ok(
  $$ select public.create_contact_full(gen_random_uuid(), 'QA rpc', null, null, '[]'::jsonb) $$,
  'P0001', 'terms_not_accepted', 'a write through a SECURITY DEFINER RPC is refused too'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('tour-gpx', '33333333-3333-3333-3333-333333333333/x.gpx') $$,
  'P0001', 'terms_not_accepted', 'a GPX upload is refused'
);
select lives_ok(
  $$ select count(*) from public.contacts $$, 'reading is never refused'
);
select lives_ok(
  $$ delete from public.contacts where first_name = 'QA off' $$, 'deleting own data is never refused'
);

select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ insert into public.contacts (first_name) values ('QA accepted') $$,
  'with the acceptance the write passes'
);

-- No user on the request (service role, cron, the auth server): never refused.
reset role;
select set_config('request.jwt.claims', '', true);
select lives_ok(
  $$ insert into public.contacts (first_name, user_id) values ('QA service', '33333333-3333-3333-3333-333333333333') $$,
  'a write with no user on the request passes'
);

-- ---- Retention ----
insert into public.terms_acceptances (user_id, email, version)
  values (:'jakob', 'jakob@tourenbuddy.ch', public.terms_current_version());
delete from auth.users where id = :'jakob';
select ok(
  (select retain_until between now() + interval '10 years' - interval '1 minute'
                           and now() + interval '10 years' + interval '1 minute'
     from public.terms_acceptances where user_id = :'jakob'),
  'deleting the account keeps the record for 10 years from the deletion'
);

insert into public.terms_acceptances (user_id, version, retain_until) values
  (gen_random_uuid(), '2016-01-01', now() - interval '1 day');
insert into public.terms_acceptances (id, user_id, version) values
  ('eeeeeeee-0000-0000-0000-000000000001', gen_random_uuid(), '2026-11-22');
select public.fn_purge_terms_acceptances();
select ok(
  not exists (select 1 from public.terms_acceptances where version = '2016-01-01')
  and (select retain_until is not null from public.terms_acceptances where id = 'eeeeeeee-0000-0000-0000-000000000001'),
  'the purge removes expired records and marks orphans'
);

select * from finish();
rollback;
