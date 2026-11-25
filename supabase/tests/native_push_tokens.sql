-- Native push tokens: RLS and registration RPC (change: add-native-backend, design D2).
--
-- pgTAP. Assertions assume pristine seed data, so reset first:
--   supabase db reset && supabase test db
--
-- Seed identities (supabase/seed.sql): Patrick 1111, Jakob 2222.

\set ON_ERROR_STOP on
\set patrick '11111111-1111-1111-1111-111111111111'
\set jakob '22222222-2222-2222-2222-222222222222'

begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

delete from public.device_push_tokens;

-- 1. Anonymous callers cannot register.
set local role anon;
select throws_ok(
  $$ select public.register_device_push_token('tok-a', 'ios', 'ch.tourenbuddy.app', 'production', '0.1.0') $$,
  '42501', null, 'anon has no execute on register_device_push_token'
);
reset role;

-- 2. Patrick registers his iPhone.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.register_device_push_token('tok-a', 'ios', 'ch.tourenbuddy.app.dev', 'development', '0.1.0') $$,
  'a signed-in user registers a token'
);
select is((select count(*)::int from public.device_push_tokens), 1, 'the user sees their own row');

-- 3. Invalid arguments raise (table checks).
select throws_ok(
  $$ select public.register_device_push_token('tok-b', 'ios', 'ch.tourenbuddy.app', null, '0.1.0') $$,
  '23514', null, 'an iOS token needs an APNs environment'
);
select throws_ok(
  $$ select public.register_device_push_token('tok-b', 'web', 'ch.tourenbuddy.app', null, null) $$,
  '23514', null, 'unknown platform rejected'
);
select throws_ok(
  $$ select public.register_device_push_token('tok-b', 'android', 'com.example.other', null, null) $$,
  '23514', null, 'foreign app id rejected'
);

-- 4. No direct writes.
select throws_ok(
  $$ insert into public.device_push_tokens (user_id, platform, token, app_id) values (auth.uid(), 'android', 'tok-x', 'ch.tourenbuddy.app') $$,
  '42501', null, 'no direct insert'
);
select throws_ok(
  $$ update public.device_push_tokens set token = 'tok-y' $$,
  '42501', null, 'no direct update'
);

-- 5. Jakob signs in on the same phone: the token moves to him; Patrick cannot see or delete it.
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
select public.register_device_push_token('tok-a', 'ios', 'ch.tourenbuddy.app.dev', 'development', '0.2.0');
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.device_push_tokens), 0, 'previous owner no longer sees the token');
delete from public.device_push_tokens where token = 'tok-a';
reset role;
select is(
  (select user_id from public.device_push_tokens where token = 'tok-a'),
  :'jakob'::uuid, 'last registrant owns the token; the other user could not delete it'
);
select is(
  (select app_version from public.device_push_tokens where token = 'tok-a'),
  '0.2.0', 'the re-registration refreshed the row'
);

-- 6. Jakob signs out on that phone: he deletes his own row.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'jakob', 'role', 'authenticated')::text, true);
delete from public.device_push_tokens where token = 'tok-a';
reset role;
select is((select count(*)::int from public.device_push_tokens), 0, 'owner deletes own row');

-- 7. An Android token stores no APNs environment even if one is passed.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'patrick', 'role', 'authenticated')::text, true);
select public.register_device_push_token('fcm-1', 'android', 'ch.tourenbuddy.app', 'production', null);
reset role;
select is(
  (select apns_environment from public.device_push_tokens where token = 'fcm-1'),
  null, 'android rows carry no APNs environment'
);

select * from finish();
rollback;
