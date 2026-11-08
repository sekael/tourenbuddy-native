-- ============================================================
-- user_availability: per-day availability a user marks on the
-- planned calendar. One row per available day, natural composite key.
--
-- Scope: OWN availability only (#242). Friend read access + realtime
-- broadcast are additive and land in #244 — no schema change needed:
-- the composite (user_id, date) key already supports the future
-- group-intersection query `... where user_id = any(<friends>) group by date`.
-- ============================================================

-- 1. Table -------------------------------------------------------
create table public.user_availability (
  user_id uuid not null references auth.users (id) on delete cascade,
  date    date not null,
  primary key (user_id, date)
);

-- Supabase removes the implicit Data API grant for new public tables on
-- 2026-10-30 — grant explicitly. RLS below still governs row access.
grant all on table public.user_availability to anon, authenticated, service_role;

-- 2. RLS — owner-only (no friend read here; that is #244) ---------
alter table public.user_availability enable row level security;

create policy "user_availability_select_own"
  on public.user_availability for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_availability_insert_own"
  on public.user_availability for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_availability_delete_own"
  on public.user_availability for delete
  to authenticated
  using (user_id = auth.uid());

-- 3. Atomic diff apply -------------------------------------------
-- Applies a save's added + removed days in a single transaction, so a
-- partial failure never leaves availability half-applied.
--
-- SECURITY INVOKER (the default): the function runs as the calling user,
-- so the owner-only RLS policies above still gate every write and
-- auth.uid() resolves to the caller. It only ever writes rows for
-- auth.uid(); the `added`/`removed` arrays are plain calendar dates the
-- client computed — the function never derives "now" itself (the
-- past/future cutoff is the client's concern, in one canonical timezone).
create function public.apply_availability_diff(
  added   date[],
  removed date[]
)
returns void
language sql
security invoker
set search_path = ''
as $$
  with ins as (
    insert into public.user_availability (user_id, date)
    select auth.uid(), unnest(coalesce(added, '{}'::date[]))
    on conflict (user_id, date) do nothing
  )
  delete from public.user_availability
  where user_id = auth.uid()
    and date = any (coalesce(removed, '{}'::date[]));
$$;

grant execute on function public.apply_availability_diff(date[], date[]) to authenticated;
