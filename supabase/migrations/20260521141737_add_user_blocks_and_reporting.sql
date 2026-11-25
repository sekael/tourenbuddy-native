-- ============================================================
-- user_blocks: tracks active and historical blocks between users
-- ============================================================
create table public.user_blocks (
  blocker_user_id  uuid not null references auth.users(id) on delete cascade,
  blocked_user_id  uuid not null references auth.users(id) on delete cascade,
  first_blocked_at timestamptz not null default now(),
  last_blocked_at  timestamptz not null default now(),
  unblocked_at     timestamptz null,
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

-- Blocker sees only own rows; blocked user never sees they were blocked.
-- All writes go through RPCs — no direct INSERT/UPDATE/DELETE granted.
alter table public.user_blocks enable row level security;
create policy "user_blocks_select_own"
  on public.user_blocks for select
  using (auth.uid() = blocker_user_id);

-- ============================================================
-- abuse_reports: capture-only, no moderation pipeline.
-- Nullable FKs so GDPR account deletion anonymises rows rather than deleting them.
-- UNIQUE per (reporter, reported) — report_user RPC uses ON CONFLICT DO UPDATE.
-- Postgres treats NULLs as distinct in unique indexes so anonymised rows don't collide.
-- ============================================================
create table public.abuse_reports (
  id               bigint primary key generated always as identity,
  reporter_user_id uuid null references auth.users(id) on delete set null,
  reported_user_id uuid null references auth.users(id) on delete set null,
  reason           text check (reason is null or length(reason) <= 1000),
  created_at       timestamptz not null default now(),
  unique (reporter_user_id, reported_user_id)
);

alter table public.abuse_reports enable row level security;
-- INSERT allowed when caller is reporter; SELECT denied to authenticated (admin-only).
create policy "abuse_reports_insert_own"
  on public.abuse_reports for insert
  with check (auth.uid() = reporter_user_id);

-- ============================================================
-- is_blocked_by(target): SECURITY DEFINER — reads user_blocks
-- as the definer to check whether target has blocked the caller.
-- ============================================================
create or replace function public.is_blocked_by(target uuid)
returns boolean
language sql
security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.user_blocks
    where blocker_user_id = target
      and blocked_user_id = auth.uid()
      and unblocked_at is null
  );
$$;

revoke all on function public.is_blocked_by(uuid) from public;
grant execute on function public.is_blocked_by(uuid) to authenticated;

-- ============================================================
-- block_user(target): atomic cascade SECURITY INVOKER.
-- Requires phone-verified caller. Advisory lock on symmetric pair
-- serialises against concurrent send_friend_request.
-- ============================================================
create or replace function public.block_user(target uuid)
returns void
language plpgsql
security invoker
set search_path to ''
as $$
begin
  if target = auth.uid() then
    raise exception 'cannot block yourself' using errcode = 'P0001';
  end if;

  if not public.is_phone_verified(auth.uid()) then
    raise exception 'phone_not_verified' using errcode = 'P0001';
  end if;

  -- Pair-scoped advisory lock — serialises with send_friend_request for the same pair
  perform pg_advisory_xact_lock(
    hashtext('block:' || least(auth.uid()::text, target::text)
                      || ':' || greatest(auth.uid()::text, target::text))
  );

  if exists (
    select 1 from public.user_blocks
    where blocker_user_id = auth.uid()
      and blocked_user_id = target
      and unblocked_at is null
  ) then
    raise exception 'already_blocked' using errcode = 'P0001';
  end if;

  -- Cascade: delete friendship + terminate pending requests in both directions
  perform public.terminate_pending_and_friendship_between(auth.uid(), array[target]);

  -- Insert block row; on re-block UPDATE keeps first_blocked_at, resets last_blocked_at and clears unblocked_at
  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (auth.uid(), target)
  on conflict (blocker_user_id, blocked_user_id) do update
    set unblocked_at    = null,
        last_blocked_at = now();
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

-- ============================================================
-- unblock_user(target): enforces 48h cooldown since last_blocked_at.
-- Returns remaining seconds in DETAIL on violation.
-- ============================================================
create or replace function public.unblock_user(target uuid)
returns void
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_block public.user_blocks;
  v_remaining numeric;
begin
  select * into v_block
  from public.user_blocks
  where blocker_user_id = auth.uid()
    and blocked_user_id = target
    and unblocked_at is null;

  if not found then
    raise exception 'not_blocked' using errcode = 'P0001';
  end if;

  v_remaining := extract(epoch from (v_block.last_blocked_at + interval '48 hours' - now()));
  if v_remaining > 0 then
    raise exception 'cooldown_active'
      using errcode = 'P0001',
            detail = v_remaining::text;
  end if;

  update public.user_blocks
  set unblocked_at = now()
  where blocker_user_id = auth.uid()
    and blocked_user_id = target;
end;
$$;

revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ============================================================
-- report_user(target, reason): insert-only abuse capture.
-- ON CONFLICT DO UPDATE allows updating reason on subsequent reports.
-- No pipeline, no notification, no automated action.
-- ============================================================
create or replace function public.report_user(target uuid, reason text)
returns void
language plpgsql
security invoker
set search_path to ''
as $$
begin
  insert into public.abuse_reports (reporter_user_id, reported_user_id, reason)
  values (auth.uid(), target, reason)
  on conflict (reporter_user_id, reported_user_id) do update
    set reason     = excluded.reason,
        created_at = now();
end;
$$;

revoke all on function public.report_user(uuid, text) from public;
grant execute on function public.report_user(uuid, text) to authenticated;

-- ============================================================
-- send_friend_request(p_to_user_id): SECURITY INVOKER RPC.
-- Acquires pair-scoped advisory lock to serialise with block_user.
-- Raises typed error if caller is actively blocked by target.
-- ============================================================
create or replace function public.send_friend_request(p_to_user_id uuid)
returns public.friend_requests
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_row public.friend_requests;
begin
  -- Same lock key as block_user — serialises the pair
  perform pg_advisory_xact_lock(
    hashtext('block:' || least(auth.uid()::text, p_to_user_id::text)
                      || ':' || greatest(auth.uid()::text, p_to_user_id::text))
  );

  if exists (
    select 1 from public.user_blocks
    where blocker_user_id = p_to_user_id
      and blocked_user_id = auth.uid()
      and unblocked_at is null
  ) then
    raise exception 'blocked_by_target' using errcode = 'P0001';
  end if;

  insert into public.friend_requests (from_user_id, to_user_id)
  values (auth.uid(), p_to_user_id)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;

-- ============================================================
-- friend_requests INSERT policy: defense-in-depth alongside RPC.
-- Drops and recreates with original predicates + block predicate.
-- ============================================================
drop policy if exists "friend_requests_insert" on public.friend_requests;
create policy "friend_requests_insert"
  on public.friend_requests for insert
  with check (
    auth.uid() = from_user_id
    and public.is_phone_verified(auth.uid())
    and public.is_phone_verified(to_user_id)
    and not exists (
      select 1 from public.user_blocks
      where blocker_user_id = to_user_id
        and blocked_user_id = from_user_id
        and unblocked_at is null
    )
  );

-- ============================================================
-- Discovery RPCs: add bidirectional block filter.
-- Signatures unchanged; function bodies replaced.
-- Exempt: find_user_by_phone, is_phone_registered (pre-check RPCs).
-- ============================================================

-- find_users_by_phones: returns phone→user_id pairs the caller can discover.
create or replace function public.find_users_by_phones(p_phones text[])
returns table (phone text, user_id uuid)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_normalized text[];
begin
  if not exists (
    select 1 from auth.users
    where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return;
  end if;

  select array_agg(ltrim(p, '+'))
  into v_normalized
  from unnest(p_phones) as p;

  return query
  select ('+' || u.phone)::text, u.id
  from auth.users u
  where u.phone = any(v_normalized)
    and u.phone_confirmed_at is not null
    and u.id <> v_caller_id
    and not exists (
      select 1 from public.user_blocks ub
      where ub.unblocked_at is null
        and (
          (ub.blocker_user_id = u.id          and ub.blocked_user_id = v_caller_id)
          or
          (ub.blocker_user_id = v_caller_id   and ub.blocked_user_id = u.id)
        )
    );
end;
$$;

-- find_phones_by_user_ids: returns user_id→phone for friends/pending contacts.
create or replace function public.find_phones_by_user_ids(p_user_ids uuid[])
returns table (user_id uuid, phone text)
language plpgsql
security definer
set search_path to ''
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
    )
    and not exists (
      select 1 from public.user_blocks ub
      where ub.unblocked_at is null
        and (
          (ub.blocker_user_id = u.id          and ub.blocked_user_id = v_caller_id)
          or
          (ub.blocker_user_id = v_caller_id   and ub.blocked_user_id = u.id)
        )
    );
end;
$$;

-- get_user_names_by_ids: returns name rows for friends/pending senders.
create or replace function public.get_user_names_by_ids(p_user_ids uuid[])
returns table (user_id uuid, first_name text, last_name text)
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if not exists (
    select 1 from auth.users
    where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return;
  end if;

  return query
  select up.id, up.first_name, up.last_name
  from public.user_profile up
  where up.id = any(p_user_ids)
    and (
      exists (
        select 1 from public.friendships f
        where (f.request_user_id = v_caller_id and f.response_user_id = up.id)
           or (f.request_user_id = up.id and f.response_user_id = v_caller_id)
      )
      or exists (
        select 1 from public.friend_requests fr
        where fr.status = 'pending'
          and fr.from_user_id = up.id
          and fr.to_user_id = v_caller_id
      )
    )
    and not exists (
      select 1 from public.user_blocks ub
      where ub.unblocked_at is null
        and (
          (ub.blocker_user_id = up.id         and ub.blocked_user_id = v_caller_id)
          or
          (ub.blocker_user_id = v_caller_id   and ub.blocked_user_id = up.id)
        )
    );
end;
$$;

-- ============================================================
-- Realtime publication for user_blocks (blocker-only SELECT RLS
-- means each user only receives their own change events).
-- ============================================================
alter table public.user_blocks replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.user_blocks;
exception when duplicate_object then null;
end $$;
