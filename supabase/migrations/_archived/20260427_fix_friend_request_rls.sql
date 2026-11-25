-- The friend_requests_insert RLS policy queried auth.users directly, but the
-- authenticated role has no SELECT on that table → "permission denied for table users".
-- Fix: use a SECURITY DEFINER helper that runs as the DB owner and can read auth.users,
-- then reference it from the RLS policy instead.

create or replace function public.is_phone_verified(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where id = p_user_id and phone_confirmed_at is not null
  );
$$;

-- Replace the broken insert policy with one that uses the helper
drop policy if exists "friend_requests_insert" on public.friend_requests;

create policy "friend_requests_insert"
  on public.friend_requests for insert
  with check (
    auth.uid() = from_user_id
    and public.is_phone_verified(auth.uid())
    and public.is_phone_verified(to_user_id)
  );
