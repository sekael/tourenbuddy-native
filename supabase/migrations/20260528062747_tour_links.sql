-- Tour linking: N-way groups + handshake requests + invariant triggers.
-- See openspec/changes/tour-linking-and-backfill/ for full design.

-- =====================================================================
-- 1. Tables
-- =====================================================================

create table public.tour_link_group (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.tour_link_member (
  group_id uuid not null references public.tour_link_group(id) on delete cascade,
  tour_id uuid not null references public.tours(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, tour_id),
  unique (tour_id)
);

create index tour_link_member_group_id_idx on public.tour_link_member(group_id);

create table public.tour_link_request (
  id uuid primary key default gen_random_uuid(),
  initiator_tour_id uuid not null references public.tours(id) on delete cascade,
  target_tour_id uuid not null references public.tours(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined', 'withdrawn')) default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (initiator_tour_id <> target_tour_id)
);

create unique index tour_link_request_one_pending
  on public.tour_link_request(initiator_tour_id, target_tour_id)
  where status = 'pending';

create index tour_link_request_initiator_idx on public.tour_link_request(initiator_tour_id);
create index tour_link_request_target_idx on public.tour_link_request(target_tour_id);

-- =====================================================================
-- 2. RLS
-- =====================================================================

alter table public.tour_link_group enable row level security;
alter table public.tour_link_member enable row level security;
alter table public.tour_link_request enable row level security;

-- tour_link_group: visible if caller owns any tour in this group.
create policy "tour_link_group_select" on public.tour_link_group
  for select using (
    exists (
      select 1
      from public.tour_link_member m
      join public.tours t on t.id = m.tour_id
      where m.group_id = tour_link_group.id and t.user_id = auth.uid()
    )
  );

-- tour_link_member: visible if caller owns any tour in the same group.
create policy "tour_link_member_select" on public.tour_link_member
  for select using (
    exists (
      select 1
      from public.tour_link_member sib
      join public.tours t on t.id = sib.tour_id
      where sib.group_id = tour_link_member.group_id and t.user_id = auth.uid()
    )
  );

-- tour_link_request: visible if caller owns either referenced tour.
create policy "tour_link_request_select" on public.tour_link_request
  for select using (
    exists (
      select 1 from public.tours t
      where t.id in (initiator_tour_id, target_tour_id) and t.user_id = auth.uid()
    )
  );

-- NO insert/update/delete policies — all mutations go through SECURITY DEFINER RPCs below.

-- =====================================================================
-- 3. Shared collision predicate
-- =====================================================================

create or replace function public.fn_collision_predicate(tour_a_id uuid, tour_b_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    a.id <> b.id
    and a.tour_type is not null
    and a.tour_type = b.tour_type
    and a.visibility = 'friends'
    and b.visibility = 'friends'
    and extensions.st_dwithin(a.goal, b.goal, 100)
    and exists (
      select 1 from public.friendships f
      where (f.request_user_id = a.user_id and f.response_user_id = b.user_id)
         or (f.request_user_id = b.user_id and f.response_user_id = a.user_id)
    )
  from public.tours a, public.tours b
  where a.id = tour_a_id and b.id = tour_b_id;
$$;

-- =====================================================================
-- 4. SECURITY DEFINER RPCs
-- =====================================================================

-- Helper: detect "merge two existing multi-tour groups" — forbidden by design.
create or replace function public.fn_would_merge_groups(p_initiator_tour_id uuid, p_target_tour_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with gi as (
    select group_id from public.tour_link_member where tour_id = p_initiator_tour_id
  ), gt as (
    select group_id from public.tour_link_member where tour_id = p_target_tour_id
  )
  select
    (select group_id from gi) is not null
    and (select group_id from gt) is not null
    and (select group_id from gi) <> (select group_id from gt);
$$;

create or replace function public.create_link_request(
  p_initiator_tour_id uuid,
  p_target_tour_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initiator_owner uuid;
  v_request_id uuid;
begin
  select user_id into v_initiator_owner from public.tours where id = p_initiator_tour_id;
  if v_initiator_owner is null or v_initiator_owner <> auth.uid() then
    raise exception 'tour_link.not_initiator_owner' using errcode = '42501';
  end if;

  if not public.fn_collision_predicate(p_initiator_tour_id, p_target_tour_id) then
    raise exception 'tour_link.predicate_failed' using errcode = 'P0001';
  end if;

  if public.fn_would_merge_groups(p_initiator_tour_id, p_target_tour_id) then
    raise exception 'tour_link.merge_forbidden' using errcode = 'P0001';
  end if;

  insert into public.tour_link_request (initiator_tour_id, target_tour_id)
  values (p_initiator_tour_id, p_target_tour_id)
  returning id into v_request_id;

  return v_request_id;
end;
$$;

-- TODO(me): implement accept_link_request body (the group-resolve + insert + return).
--   See "Your turn" task at the end of this response.
create or replace function public.accept_link_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_target_owner uuid;
  v_group_id uuid;
  v_added uuid[] := '{}';
begin
  select * into v_req from public.tour_link_request where id = p_request_id and status = 'pending';
  if v_req is null then
    raise exception 'tour_link.request_not_pending' using errcode = 'P0001';
  end if;

  select user_id into v_target_owner from public.tours where id = v_req.target_tour_id;
  if v_target_owner is null or v_target_owner <> auth.uid() then
    raise exception 'tour_link.not_target_owner' using errcode = '42501';
  end if;

  if not public.fn_collision_predicate(v_req.initiator_tour_id, v_req.target_tour_id) then
    raise exception 'tour_link.predicate_failed' using errcode = 'P0001';
  end if;

  if public.fn_would_merge_groups(v_req.initiator_tour_id, v_req.target_tour_id) then
    raise exception 'tour_link.merge_forbidden' using errcode = 'P0001';
  end if;

  -- Resolve existing group (at most one side may be grouped — merge case already rejected).
  select group_id into v_group_id
  from public.tour_link_member
  where tour_id in (v_req.initiator_tour_id, v_req.target_tour_id)
  limit 1;

  if v_group_id is null then
    insert into public.tour_link_group default values returning id into v_group_id;
  end if;

  -- Attach both tours; existing member row (the grouped side) is a no-op.
  with ins as (
    insert into public.tour_link_member (group_id, tour_id)
    values (v_group_id, v_req.initiator_tour_id), (v_group_id, v_req.target_tour_id)
    on conflict (tour_id) do nothing
    returning tour_id
  )
  select coalesce(array_agg(tour_id), '{}') into v_added from ins;

  update public.tour_link_request
     set status = 'accepted', resolved_at = now()
   where id = p_request_id;

  return jsonb_build_object('group_id', v_group_id, 'added_tour_ids', v_added);
end;
$$;

create or replace function public.decline_link_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_owner uuid;
begin
  select t.user_id into v_target_owner
  from public.tour_link_request r
  join public.tours t on t.id = r.target_tour_id
  where r.id = p_request_id and r.status = 'pending';

  if v_target_owner is null or v_target_owner <> auth.uid() then
    raise exception 'tour_link.not_target_owner' using errcode = '42501';
  end if;

  update public.tour_link_request
     set status = 'declined', resolved_at = now()
   where id = p_request_id;
end;
$$;

create or replace function public.withdraw_link_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initiator_owner uuid;
begin
  select t.user_id into v_initiator_owner
  from public.tour_link_request r
  join public.tours t on t.id = r.initiator_tour_id
  where r.id = p_request_id and r.status = 'pending';

  if v_initiator_owner is null or v_initiator_owner <> auth.uid() then
    raise exception 'tour_link.not_initiator_owner' using errcode = '42501';
  end if;

  update public.tour_link_request
     set status = 'withdrawn', resolved_at = now()
   where id = p_request_id;
end;
$$;

revoke all on function public.create_link_request(uuid, uuid) from public;
revoke all on function public.accept_link_request(uuid) from public;
revoke all on function public.decline_link_request(uuid) from public;
revoke all on function public.withdraw_link_request(uuid) from public;

grant execute on function public.create_link_request(uuid, uuid) to authenticated;
grant execute on function public.accept_link_request(uuid) to authenticated;
grant execute on function public.decline_link_request(uuid) to authenticated;
grant execute on function public.withdraw_link_request(uuid) to authenticated;

-- =====================================================================
-- 5. Invariant triggers
-- =====================================================================

-- Void any pending requests that reference the given tour (helper for eviction triggers).
create or replace function public.fn_void_pending_requests_for_tour(p_tour_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tour_link_request
     set status = 'withdrawn', resolved_at = now()
   where status = 'pending'
     and (initiator_tour_id = p_tour_id or target_tour_id = p_tour_id);
$$;

-- Void any pending requests crossing the broken friendship pair.
create or replace function public.fn_void_pending_requests_for_pair(p_user_a uuid, p_user_b uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.tour_link_request r
     set status = 'withdrawn', resolved_at = now()
    from public.tours ta, public.tours tb
   where r.status = 'pending'
     and ta.id = r.initiator_tour_id and tb.id = r.target_tour_id
     and ((ta.user_id = p_user_a and tb.user_id = p_user_b)
       or (ta.user_id = p_user_b and tb.user_id = p_user_a));
$$;

-- AFTER UPDATE on tours: evict if tour_type / visibility / goal changes break invariants.
create or replace function public.fn_evict_member_on_tour_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_group_id uuid;
  v_evict boolean := false;
begin
  select group_id into v_group_id from public.tour_link_member where tour_id = new.id;
  if v_group_id is null then
    return new;
  end if;

  if new.tour_type is distinct from old.tour_type then
    v_evict := true;
  elsif old.visibility = 'friends' and new.visibility <> 'friends' then
    v_evict := true;
  elsif not extensions.st_equals(new.goal::extensions.geometry, old.goal::extensions.geometry) then
    if exists (
      select 1
      from public.tour_link_member sib
      join public.tours st on st.id = sib.tour_id
      where sib.group_id = v_group_id and sib.tour_id <> new.id
        and not extensions.st_dwithin(new.goal, st.goal, 100)
    ) then
      v_evict := true;
    end if;
  end if;

  if v_evict then
    delete from public.tour_link_member where tour_id = new.id;
    perform public.fn_void_pending_requests_for_tour(new.id);
  end if;

  return new;
end;
$$;

create trigger trg_evict_member_on_tour_change
  after update on public.tours
  for each row execute function public.fn_evict_member_on_tour_change();

-- AFTER DELETE on friendships: evict both users' tours from any shared groups.
create or replace function public.fn_evict_on_friendship_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evicted record;
begin
  for v_evicted in
    select distinct ma.tour_id as a_tour, mb.tour_id as b_tour
    from public.tour_link_member ma
    join public.tours ta on ta.id = ma.tour_id
    join public.tour_link_member mb on mb.group_id = ma.group_id and mb.tour_id <> ma.tour_id
    join public.tours tb on tb.id = mb.tour_id
    where (ta.user_id = old.request_user_id and tb.user_id = old.response_user_id)
       or (ta.user_id = old.response_user_id and tb.user_id = old.request_user_id)
  loop
    delete from public.tour_link_member where tour_id in (v_evicted.a_tour, v_evicted.b_tour);
    perform public.fn_void_pending_requests_for_tour(v_evicted.a_tour);
    perform public.fn_void_pending_requests_for_tour(v_evicted.b_tour);
  end loop;

  perform public.fn_void_pending_requests_for_pair(old.request_user_id, old.response_user_id);
  return old;
end;
$$;

create trigger trg_evict_on_friendship_delete
  after delete on public.friendships
  for each row execute function public.fn_evict_on_friendship_delete();

-- AFTER DELETE on tour_link_member: dissolve group when count drops below 2.
create or replace function public.fn_dissolve_when_below_two()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.tour_link_member where group_id = old.group_id) < 2 then
    delete from public.tour_link_group where id = old.group_id;
  end if;
  return old;
end;
$$;

create trigger trg_dissolve_when_below_two
  after delete on public.tour_link_member
  for each row execute function public.fn_dissolve_when_below_two();

-- =====================================================================
-- 6. Realtime publication for handshake feedback
-- =====================================================================

alter publication supabase_realtime add table public.tour_link_request;

-- =====================================================================
-- 6b. Scan helpers (used by the Worker for collision-detected + backfill notifications)
-- =====================================================================

-- All friend-owned tours that collide with the given (caller-owned) tour.
create or replace function public.fn_scan_collisions_for_tour(p_tour_id uuid)
returns table (other_tour_id uuid, other_user_id uuid, other_tour_name text)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select b.id, b.user_id, b.name
  from public.tours a
  join public.tours b on b.id <> a.id
  where a.id = p_tour_id
    and a.tour_type is not null and a.tour_type = b.tour_type
    and a.visibility = 'friends' and b.visibility = 'friends'
    and extensions.st_dwithin(a.goal, b.goal, 100)
    and exists (
      select 1 from public.friendships f
      where (f.request_user_id = a.user_id and f.response_user_id = b.user_id)
         or (f.request_user_id = b.user_id and f.response_user_id = a.user_id)
    );
$$;

-- All not-yet-linked, no-pending-request collisions between two users' tours.
create or replace function public.fn_scan_backfill_collisions(p_user_a uuid, p_user_b uuid)
returns table (a_tour_id uuid, b_tour_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select ta.id, tb.id
  from public.tours ta
  join public.tours tb on tb.user_id = p_user_b
  where ta.user_id = p_user_a
    and ta.tour_type is not null and ta.tour_type = tb.tour_type
    and ta.visibility = 'friends' and tb.visibility = 'friends'
    and extensions.st_dwithin(ta.goal, tb.goal, 100)
    and not exists (
      select 1
      from public.tour_link_member ma
      join public.tour_link_member mb on mb.group_id = ma.group_id
      where ma.tour_id = ta.id and mb.tour_id = tb.id
    )
    and not exists (
      select 1 from public.tour_link_request r
      where r.status = 'pending'
        and ((r.initiator_tour_id = ta.id and r.target_tour_id = tb.id)
          or (r.initiator_tour_id = tb.id and r.target_tour_id = ta.id))
    );
$$;

grant execute on function public.fn_scan_collisions_for_tour(uuid) to service_role;
grant execute on function public.fn_scan_backfill_collisions(uuid, uuid) to service_role;

-- Client-callable: list backfill collision pairs for a friendship the caller is part of.
-- Returns [{your_tour_id, your_tour_name, friend_tour_id, friend_tour_name, friend_user_id}].
create or replace function public.list_backfill_pairs_for_friendship(p_friendship_id uuid)
returns table (
  your_tour_id uuid,
  your_tour_name text,
  friend_tour_id uuid,
  friend_tour_name text,
  friend_user_id uuid
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_me uuid := auth.uid();
  v_other uuid;
begin
  -- friend_requests.id is the friendship's stable identifier (friendships.request_id FK).
  select fs.request_user_id, fs.response_user_id
    into v_user_a, v_user_b
  from public.friendships fs
  where fs.request_id = p_friendship_id
  limit 1;

  if v_user_a is null then
    return;
  end if;

  if v_me <> v_user_a and v_me <> v_user_b then
    raise exception 'tour_link.not_a_friendship_member' using errcode = '42501';
  end if;

  v_other := case when v_me = v_user_a then v_user_b else v_user_a end;

  return query
    select
      my.id, my.name, fr.id, fr.name, fr.user_id
    from public.tours my
    join public.tours fr on fr.user_id = v_other
    where my.user_id = v_me
      and my.tour_type is not null and my.tour_type = fr.tour_type
      and my.visibility = 'friends' and fr.visibility = 'friends'
      and extensions.st_dwithin(my.goal, fr.goal, 100)
      and not exists (
        select 1
        from public.tour_link_member ma
        join public.tour_link_member mb on mb.group_id = ma.group_id
        where ma.tour_id = my.id and mb.tour_id = fr.id
      )
      and not exists (
        select 1 from public.tour_link_request r
        where r.status = 'pending'
          and ((r.initiator_tour_id = my.id and r.target_tour_id = fr.id)
            or (r.initiator_tour_id = fr.id and r.target_tour_id = my.id))
      );
end;
$$;

revoke all on function public.list_backfill_pairs_for_friendship(uuid) from public;
grant execute on function public.list_backfill_pairs_for_friendship(uuid) to authenticated;

-- =====================================================================
-- 7. Grants on tables (SELECT only; mutations via RPC)
-- =====================================================================

grant select on public.tour_link_group to authenticated;
grant select on public.tour_link_member to authenticated;
grant select on public.tour_link_request to authenticated;
