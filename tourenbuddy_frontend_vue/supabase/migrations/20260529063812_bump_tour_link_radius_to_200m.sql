-- Bump tour-link collision radius from 100 m to 200 m.
-- Touches all five SQL functions that compared goal distances against the
-- hard-coded 100 m threshold. Keep client-side COLLISION_RADIUS_M in sync.
--
-- Future thought: hoist into a `fn_collision_radius_m()` helper if we change
-- this again. Inlining for now to keep the diff scoped.

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
    and extensions.st_dwithin(a.goal, b.goal, 200)
    and exists (
      select 1 from public.friendships f
      where (f.request_user_id = a.user_id and f.response_user_id = b.user_id)
         or (f.request_user_id = b.user_id and f.response_user_id = a.user_id)
    )
  from public.tours a, public.tours b
  where a.id = tour_a_id and b.id = tour_b_id;
$$;

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
        and not extensions.st_dwithin(new.goal, st.goal, 200)
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
    and extensions.st_dwithin(a.goal, b.goal, 200)
    and exists (
      select 1 from public.friendships f
      where (f.request_user_id = a.user_id and f.response_user_id = b.user_id)
         or (f.request_user_id = b.user_id and f.response_user_id = a.user_id)
    );
$$;

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
    and extensions.st_dwithin(ta.goal, tb.goal, 200)
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
      and extensions.st_dwithin(my.goal, fr.goal, 200)
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
