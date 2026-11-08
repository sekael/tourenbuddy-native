-- Regression checks for 20261108120000_unconfirmed_accounts_hold_no_password.sql: a password
-- given to an address nobody confirmed (Supabase's open /signup) never signs in, also after the
-- address's owner confirms it with a code; passwords of confirmed accounts are untouched.
--
-- pgTAP. Rolled back, so the local seed is untouched. Assertions assume pristine seed data:
--   supabase db reset && supabase test db

\set ON_ERROR_STOP on

\set patrick '11111111-1111-1111-1111-111111111111'
\set stranger 'eeeeeeee-0000-0000-0000-000000000001'
\set confirmed 'eeeeeeee-0000-0000-0000-000000000002'
\set phone_only 'eeeeeeee-0000-0000-0000-000000000003'

begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- A user row as GoTrue writes it, with a password.
create function pg_temp.add_user(p_id uuid, p_email text, p_email_confirmed timestamptz,
  p_phone text, p_phone_confirmed timestamptz) returns void language sql as $$
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values (p_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, extensions.crypt('chosen-by-a-stranger', extensions.gen_salt('bf')),
    p_email_confirmed, p_phone, p_phone_confirmed, '{"provider":"email","providers":["email"]}',
    '{}', now(), now(), '', '', '', '')
$$;

create function pg_temp.password_of(p_id uuid) returns text language sql as $$
  select encrypted_password from auth.users where id = p_id
$$;

-- 1 — /signup with an unconfirmed address: the password is dropped on insert.
select pg_temp.add_user(:'stranger', 'victim@example.com', null, null, null);
select is(pg_temp.password_of(:'stranger'), '', '1 unconfirmed account created without its password');

-- 2 — Setting a password while still unconfirmed does not stick either.
update auth.users set encrypted_password = extensions.crypt('again', extensions.gen_salt('bf'))
 where id = :'stranger';
select is(pg_temp.password_of(:'stranger'), '', '2 unconfirmed account keeps no password on update');

-- 3 — The owner confirms the address with a code: no password comes back.
update auth.users set email_confirmed_at = now() where id = :'stranger';
select is(pg_temp.password_of(:'stranger'), '', '3 confirming the address restores no password');

-- 4 — After confirmation, setting a password works (the app's Password sheet, Create account).
update auth.users set encrypted_password = extensions.crypt('owner-chosen', extensions.gen_salt('bf'))
 where id = :'stranger';
select ok(pg_temp.password_of(:'stranger') = extensions.crypt('owner-chosen', pg_temp.password_of(:'stranger')),
  '4 confirmed account takes a password');

-- 5 — A user inserted already confirmed keeps the password (dashboard "Create user", the seed).
select pg_temp.add_user(:'confirmed', 'confirmed@example.com', now(), null, null);
select isnt(pg_temp.password_of(:'confirmed'), '', '5 confirmed account created with its password');

-- 6 — A confirmed phone counts as confirmed.
select pg_temp.add_user(:'phone_only', null, null, '41790009999', now());
select isnt(pg_temp.password_of(:'phone_only'), '', '6 phone-confirmed account keeps its password');

-- 7 — The seed's demo users keep their passwords.
select ok(pg_temp.password_of(:'patrick') = extensions.crypt('test-password-123', pg_temp.password_of(:'patrick')),
  '7 seeded demo user keeps its password');

-- 8 — No client role can call the trigger function; GoTrue's role can run it.
select ok(
  not has_function_privilege('authenticated', 'public.fn_unconfirmed_users_hold_no_password()', 'execute')
  and not has_function_privilege('anon', 'public.fn_unconfirmed_users_hold_no_password()', 'execute')
  and has_function_privilege('supabase_auth_admin', 'public.fn_unconfirmed_users_hold_no_password()', 'execute'),
  '8 trigger function closed to client roles, open to supabase_auth_admin');

select * from finish();
rollback;
