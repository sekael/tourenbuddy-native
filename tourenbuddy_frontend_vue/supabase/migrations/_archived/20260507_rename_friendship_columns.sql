-- Drop the canonical-order check (user_a_id < user_b_id).
-- Postgres auto-names unnamed table-level check constraints as <table>_check.
alter table public.friendships drop constraint if exists friendships_check;

-- Rename columns to reflect request semantics.
alter table public.friendships rename column user_a_id to request_user_id;
alter table public.friendships rename column user_b_id to response_user_id;

-- Backfill: fix rows where current ordering disagrees with friend_requests.from_user_id.
-- Only rows with a known request_id can be corrected; null-request_id rows are left as-is.
update public.friendships f
set
  request_user_id = fr.from_user_id,
  response_user_id = fr.to_user_id
from public.friend_requests fr
where f.request_id = fr.id
  and f.request_user_id <> fr.from_user_id;

-- Add functional unique index to guarantee one row per unordered pair.
create unique index if not exists friendships_unordered_pair_idx
  on public.friendships (
    least(request_user_id, response_user_id),
    greatest(request_user_id, response_user_id)
  );

-- Recreate RLS select policy with new column names.
drop policy if exists "friendships_select" on public.friendships;
create policy "friendships_select"
  on public.friendships for select
  using (auth.uid() = request_user_id or auth.uid() = response_user_id);

-- Recreate accept_friend_request: insert uses semantic ordering (from → request, to → response).
create or replace function public.accept_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_from uuid;
  v_to uuid;
  v_status text;
begin
  select from_user_id, to_user_id, status
  into v_from, v_to, v_status
  from public.friend_requests
  where id = p_request_id;

  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_caller_id <> v_to then
    raise exception 'Only the recipient can accept a friend request';
  end if;

  if v_status = 'accepted' then
    return; -- idempotent
  end if;

  if v_status <> 'pending' then
    raise exception 'Friend request is not pending';
  end if;

  update public.friend_requests
  set status = 'accepted', responded_at = now()
  where id = p_request_id;

  insert into public.friendships (request_user_id, response_user_id, request_id)
  values (v_from, v_to, p_request_id)
  on conflict (least(request_user_id, response_user_id), greatest(request_user_id, response_user_id))
  do nothing;
end;
$$;

-- Recreate remove_friendship: matches regardless of which role the caller holds.
create or replace function public.remove_friendship(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  delete from public.friendships
  where (request_user_id = v_caller_id and response_user_id = p_other_user_id)
     or (request_user_id = p_other_user_id and response_user_id = v_caller_id);
end;
$$;

-- Recreate find_phones_by_user_ids with updated column names.
create or replace function public.find_phones_by_user_ids(p_user_ids uuid[])
returns table(user_id uuid, phone text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if not exists (
    select 1 from auth.users where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return;
  end if;

  return query
  select u.id, ('+' || u.phone)::text
  from auth.users u
  where u.id = any(p_user_ids)
    and u.phone_confirmed_at is not null
    and (
      exists (
        select 1 from public.friend_requests fr
        where fr.status = 'pending'
          and (
            (fr.from_user_id = v_caller_id and fr.to_user_id = u.id)
            or (fr.from_user_id = u.id and fr.to_user_id = v_caller_id)
          )
      )
      or exists (
        select 1 from public.friendships f
        where (f.request_user_id = v_caller_id and f.response_user_id = u.id)
           or (f.request_user_id = u.id and f.response_user_id = v_caller_id)
      )
    );
end;
$$;
