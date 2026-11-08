-- An account without a confirmed email or phone never holds a password.
--
-- Supabase's /signup endpoint takes an address and a password from anyone holding the public anon
-- key, whatever the clients do. The account it creates stays unusable while unconfirmed, but its
-- owner confirms it simply by signing in with an email code (PWA, native app), and the password a
-- stranger gave it would then sign in to their account.
--
-- Every legitimate password is set on a confirmed account: the native app sets it only after the
-- code (Create account, the Password sheet), the seed inserts confirmed demo users, the dashboard's
-- "Create user" confirms. So the rule needs no notion of "creation": whenever a row is written
-- without a confirmed email or phone, its password is emptied ('' is GoTrue's "no password"), and
-- confirming the address later brings nothing back. GoTrue's /signup never updates an existing
-- unconfirmed user; the update branch is the same rule, not a known path.
--
-- A trigger, not the before-user-created auth hook: the hook's payload does not say whether a
-- password was given, and it does not run on updates. A trigger is not an ALTER TABLE on the
-- Supabase-owned auth.users. GoTrue writes the rows as supabase_auth_admin, which gets EXECUTE
-- explicitly (the security-hardening default revokes it from everyone); client roles never do.

create or replace function public.fn_unconfirmed_users_hold_no_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null and new.phone_confirmed_at is null then
    new.encrypted_password := '';
  end if;
  return new;
end;
$$;

revoke all on function public.fn_unconfirmed_users_hold_no_password() from public, anon, authenticated;
grant execute on function public.fn_unconfirmed_users_hold_no_password() to supabase_auth_admin;

create trigger unconfirmed_users_hold_no_password
  before insert or update of encrypted_password on auth.users
  for each row execute function public.fn_unconfirmed_users_hold_no_password();

-- The trigger only guards writes from now on. Until now confirmations were off, so /signup created
-- accounts confirmed on the spot, with any password: those rows pass the trigger. No client ever
-- set a password before this (the PWA signs in with a code only; its updateUser calls change the
-- phone and the locale), so every password here came from /signup or the dashboard, and nobody
-- signs in with one. Drop them all, without exceptions: every account still signs in with a code,
-- and sets a password in the native app's Profile when it wants one. Locally `supabase db reset`
-- runs this before the seed, so the seeded demo users keep theirs.
update auth.users set encrypted_password = '' where coalesce(encrypted_password, '') <> '';
