-- Void any pending tour_link_request whose collision predicate is broken by an
-- edit to the initiator's or target's tour. The existing eviction trigger only
-- fires for tours already in a group; tours that are merely the subject of a
-- pending link request (not yet grouped) were left in an inconsistent state and
-- caused predicate_failed errors on accept.

create or replace function public.fn_void_pending_requests_on_tour_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
begin
  -- Only react when a predicate-relevant column changed.
  if new.tour_type is not distinct from old.tour_type
     and new.visibility is not distinct from old.visibility
     and extensions.st_equals(new.goal::extensions.geometry, old.goal::extensions.geometry)
  then
    return new;
  end if;

  for r in
    select id, initiator_tour_id, target_tour_id
      from public.tour_link_request
     where status = 'pending'
       and (initiator_tour_id = new.id or target_tour_id = new.id)
  loop
    if not public.fn_collision_predicate(r.initiator_tour_id, r.target_tour_id) then
      update public.tour_link_request
         set status = 'withdrawn', resolved_at = now()
       where id = r.id;
    end if;
  end loop;

  return new;
end;
$$;

-- AFTER UPDATE on tours: keep pending requests in sync with the predicate. Runs
-- alongside the existing fn_evict_member_on_tour_change trigger (no ordering
-- requirement — the eviction path already calls fn_void_pending_requests_for_tour
-- unconditionally for grouped tours, this trigger covers the not-yet-grouped case
-- and is a no-op when the predicate still holds).
drop trigger if exists trg_void_pending_requests_on_tour_change on public.tours;
create trigger trg_void_pending_requests_on_tour_change
  after update on public.tours
  for each row execute function public.fn_void_pending_requests_on_tour_change();

-- =====================================================================
-- All-friendships backfill scan (Issue 2: in-app entry point)
-- =====================================================================
-- Client-callable: list backfill collision pairs across every accepted friendship
-- of the caller. Returns one row per (your_tour, friend_tour) pair. Each row
-- carries the friend's display info so the page can render a friend-name column.

create or replace function public.list_all_backfill_pairs()
returns table (
  your_tour_id uuid,
  your_tour_name text,
  friend_tour_id uuid,
  friend_tour_name text,
  friend_user_id uuid,
  friendship_id uuid
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with friends as (
    select fs.request_id as friendship_id,
           case when fs.request_user_id = auth.uid() then fs.response_user_id
                else fs.request_user_id end as friend_user_id
      from public.friendships fs
     where fs.request_user_id = auth.uid() or fs.response_user_id = auth.uid()
  )
  select distinct
    my.id, my.name, fr.id, fr.name, fr.user_id, f.friendship_id
  from friends f
  join public.tours my on my.user_id = auth.uid()
  join public.tours fr on fr.user_id = f.friend_user_id
  where my.tour_type is not null and my.tour_type = fr.tour_type
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
$$;

revoke all on function public.list_all_backfill_pairs() from public;
grant execute on function public.list_all_backfill_pairs() to authenticated;
