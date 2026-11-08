-- friend_requests table
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'denied', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user_id <> to_user_id)
);

-- Only one pending request between a given pair at a time
create unique index if not exists friend_requests_pending_pair_idx
  on public.friend_requests (from_user_id, to_user_id)
  where status = 'pending';

-- friendships table — ordered pair invariant: user_a_id < user_b_id
create table if not exists public.friendships (
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  request_id uuid references public.friend_requests(id) on delete set null,
  primary key (user_a_id, user_b_id),
  check (user_a_id < user_b_id)
);

-- RLS for friend_requests
alter table public.friend_requests enable row level security;

create policy "friend_requests_select"
  on public.friend_requests for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create policy "friend_requests_insert"
  on public.friend_requests for insert
  with check (
    auth.uid() = from_user_id
    and exists (
      select 1 from auth.users
      where id = auth.uid()
        and phone_confirmed_at is not null
    )
    and exists (
      select 1 from auth.users
      where id = to_user_id
        and phone_confirmed_at is not null
    )
  );

-- Recipient can update status to accepted or denied
create policy "friend_requests_update_recipient"
  on public.friend_requests for update
  using (auth.uid() = to_user_id and status = 'pending')
  with check (status in ('accepted', 'denied'));

-- Sender can cancel their own pending request
create policy "friend_requests_update_sender"
  on public.friend_requests for update
  using (auth.uid() = from_user_id and status = 'pending')
  with check (status = 'cancelled');

-- RLS for friendships
alter table public.friendships enable row level security;

create policy "friendships_select"
  on public.friendships for select
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

-- No client INSERT/UPDATE/DELETE — managed only via accept_friend_request RPC

-- SECURITY DEFINER: find a verified user by E.164 phone (excludes self)
create or replace function public.find_user_by_phone(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_result uuid;
begin
  -- Caller must be verified
  if not exists (
    select 1 from auth.users
    where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return null;
  end if;

  select id into v_result
  from auth.users
  where phone = p_phone
    and phone_confirmed_at is not null
    and id <> v_caller_id
  limit 1;

  return v_result;
end;
$$;

-- SECURITY DEFINER: batch lookup of multiple phones
create or replace function public.find_users_by_phones(p_phones text[])
returns table(phone text, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  -- Caller must be verified
  if not exists (
    select 1 from auth.users
    where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return;
  end if;

  return query
  select u.phone::text, u.id
  from auth.users u
  where u.phone = any(p_phones)
    and u.phone_confirmed_at is not null
    and u.id <> v_caller_id;
end;
$$;

-- SECURITY DEFINER: accept a friend request (transactional, idempotent)
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
  v_a uuid;
  v_b uuid;
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

  -- Update request status
  update public.friend_requests
  set status = 'accepted', responded_at = now()
  where id = p_request_id;

  -- Insert ordered pair
  v_a := least(v_from, v_to);
  v_b := greatest(v_from, v_to);

  insert into public.friendships (user_a_id, user_b_id, request_id)
  values (v_a, v_b, p_request_id)
  on conflict (user_a_id, user_b_id) do nothing;
end;
$$;
