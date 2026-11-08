-- Single pending friend request per unordered pair {A, B} (issue #209).
-- Before: friend_requests_pending_pair_idx is directional (from_user_id, to_user_id),
-- so A->B pending and B->A pending can coexist. This makes the pending guard unordered.

-- 1. Dedupe existing dual-pending pairs so the unordered unique index can be built.
--    For each unordered pair with >1 pending row, keep the earliest (created_at, tie-break id)
--    and set the rest to status = 'cancelled', responded_at = now().
with ranked as (
  select
    id,
    row_number() over (
      partition by least(from_user_id, to_user_id), greatest(from_user_id, to_user_id)
      order by created_at, id
    ) as rn
  from public.friend_requests
  where status = 'pending'
)
update public.friend_requests as fr
set status = 'cancelled', responded_at = now()
where fr.id in (select id from ranked where rn > 1);

-- 2. Replace the directional pending index with an unordered-pair one.
drop index if exists public.friend_requests_pending_pair_idx;

create unique index friend_requests_pending_pair_idx
  on public.friend_requests (least(from_user_id, to_user_id), greatest(from_user_id, to_user_id))
  where status = 'pending';

-- 3. accept_friend_request also cancels any opposite-direction pending row in the same txn.
--    Belt-and-suspenders for legacy dual-pending data (index prevents new ones going forward).
create or replace function public.accept_friend_request(p_request_id uuid) returns void
    language plpgsql security definer
    set search_path to ''
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

  -- Terminate any opposite-direction pending row for the same pair.
  update public.friend_requests
  set status = 'cancelled', responded_at = now()
  where from_user_id = v_to and to_user_id = v_from and status = 'pending';
end;
$$;
