-- ============================================================
-- list_blocked_users: returns phone + names for caller's own
-- actively blocked users. Discovery RPCs filter these out
-- bidirectionally, so this RPC is the one safe place where a
-- blocker can resolve identity for the people they themselves
-- have blocked (needed for: Blocked tab display, blocked badge
-- on contact rows, hiding "Block" buttons on already-blocked
-- contacts).
-- ============================================================
create or replace function public.list_blocked_users()
returns table (user_id uuid, phone text, first_name text, last_name text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  return query
  select
    u.id,
    case when u.phone is null or u.phone = '' then null else ('+' || u.phone) end::text,
    up.first_name,
    up.last_name
  from public.user_blocks ub
  join auth.users u on u.id = ub.blocked_user_id
  left join public.user_profile up on up.id = ub.blocked_user_id
  where ub.blocker_user_id = auth.uid()
    and ub.unblocked_at is null;
end;
$$;

revoke all on function public.list_blocked_users() from public;
grant execute on function public.list_blocked_users() to authenticated;
