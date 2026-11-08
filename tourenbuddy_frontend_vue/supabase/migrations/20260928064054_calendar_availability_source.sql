-- #287 Calendar availability sync — seed, not source of truth (design D2).
--
--   available = true,  source = 'calendar'  derived from a feed, rewritten every sync
--   available = true,  source = 'manual'    user marked it — sync never touches it
--   available = false, source = 'manual'    tombstone: user cleared it — sync never touches it
--
-- Readers treat a day as available iff a row with available = true exists.

-- ---------------------------------------------------------------------------
-- 1. Columns. Existing rows backfill to (true, 'manual') — everything in the
--    table today was typed by a human.
-- ---------------------------------------------------------------------------
alter table public.user_availability
  add column available boolean not null default true,
  add column source    text    not null default 'manual'
    check (source in ('manual', 'calendar'));

-- #242 shipped insert/delete only. Tombstoning and re-marking a tombstone are
-- UPDATEs, and apply_availability_diff is SECURITY INVOKER — without this policy
-- they would silently update 0 rows.
create policy "user_availability_update_own"
  on public.user_availability for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. apply_availability_diff — same signature (client, mutate() intent and
--    replay handler unchanged). Every write is source = 'manual'.
-- ---------------------------------------------------------------------------
create or replace function public.apply_availability_diff(
  added   date[],
  removed date[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  -- Mark: new day, or re-mark of a tombstone. The WHERE skips rows that are
  -- already manual-available, so an unchanged row is not UPDATEd (no friend ping).
  insert into public.user_availability as ua (user_id, date, available, source)
  select auth.uid(), unnest(coalesce(added, '{}'::date[])), true, 'manual'
  on conflict (user_id, date) do update
    set available = true, source = 'manual'
    where (ua.available, ua.source) is distinct from (true, 'manual');

  -- Clear with a feed connected: tombstone, so the next sync can't re-add the day.
  update public.user_availability
  set available = false, source = 'manual'
  where user_id = auth.uid()
    and date = any (coalesce(removed, '{}'::date[]))
    and available
    and exists (select 1 from public.user_calendar_feeds where user_id = auth.uid());

  -- Clear without a feed: plain delete. Pre-feed clears are deliberately not
  -- tombstoned — nothing to override yet, and the 99% without a feed keep a clean table.
  delete from public.user_availability
  where user_id = auth.uid()
    and date = any (coalesce(removed, '{}'::date[]))
    and not exists (select 1 from public.user_calendar_feeds where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- 3. apply_calendar_availability — the Worker's only write. Precedence lives
--    here, not in the Worker: a Worker bug must not be able to touch manual rows.
-- ---------------------------------------------------------------------------
create function public.apply_calendar_availability(
  p_user_id uuid,
  p_from    date,
  p_to      date,
  p_days    date[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  -- do nothing, never do update: a conflicting row is either already
  -- calendar-green (nothing to change) or manual (must not be touched).
  -- do update would also UPDATE unchanged rows and ping every friend each run.
  insert into public.user_availability (user_id, date, available, source)
  select p_user_id, d, true, 'calendar'
  from unnest(coalesce(p_days, '{}'::date[])) as d
  where d between p_from and p_to
  on conflict (user_id, date) do nothing;

  delete from public.user_availability
  where user_id = p_user_id
    and source = 'calendar'
    and date between p_from and p_to
    and not (date = any (coalesce(p_days, '{}'::date[])));

  -- ponytail: tombstone housekeeping pings friends once per expired tombstone
  -- (one redundant refetch). Accepted; filter the broadcast if it ever shows up.
  delete from public.user_availability
  where user_id = p_user_id
    and not available
    and date < p_from;
$$;

-- Writes an arbitrary p_user_id, so this grant is the only gate: service_role
-- bypasses RLS by itself (BYPASSRLS), invoker just avoids running as the owner.
revoke execute on function public.apply_calendar_availability(uuid, date, date, date[])
  from public, anon, authenticated;
grant execute on function public.apply_calendar_availability(uuid, date, date, date[])
  to service_role;

-- ---------------------------------------------------------------------------
-- 4. Friends hear about UPDATEs too (tombstone / re-mark). The #244 function
--    body is op-agnostic over `changed`, so it is reused unchanged.
-- ---------------------------------------------------------------------------
create trigger trg_broadcast_availability_update
  after update on public.user_availability
  referencing new table as changed
  for each statement execute function public.fn_broadcast_availability_change();

-- ---------------------------------------------------------------------------
-- 5. Tombstones are hidden from friends by RLS, not by the client.
--    Same friendship predicate as 20260713125720.
-- ---------------------------------------------------------------------------
drop policy "user_availability_select_friend" on public.user_availability;

create policy "user_availability_select_friend"
  on public.user_availability for select
  to authenticated
  using (
    available
    and exists (
      select 1 from public.friendships f
      where (f.request_user_id = auth.uid() and f.response_user_id = user_availability.user_id)
         or (f.request_user_id = user_availability.user_id and f.response_user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Last feed gone → back to manual-only. A trigger, not client code: the row
--    also disappears via the auth.users cascade and dashboard deletes.
--    SECURITY DEFINER so it works regardless of who deletes the feed.
-- ---------------------------------------------------------------------------
create function public.fn_cleanup_calendar_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.user_calendar_feeds where user_id = old.user_id) then
    delete from public.user_availability
    where user_id = old.user_id
      and (source = 'calendar' or not available);
  end if;
  return null;
end;
$$;

create trigger trg_cleanup_calendar_availability
  after delete on public.user_calendar_feeds
  for each row execute function public.fn_cleanup_calendar_availability();
