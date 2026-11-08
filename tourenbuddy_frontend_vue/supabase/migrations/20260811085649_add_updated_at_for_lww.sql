-- Add a server-stamped `updated_at` to the offline-writable tables so the
-- offline-write-sync change's last-write-wins conflict resolution (DC5) has a
-- reliable server timestamp to compare a queued write's `baseUpdatedAt` against.
--
-- Maintained by a BEFORE UPDATE trigger, never by app code: no write path — the
-- create/update RPCs, the direct `patchCompleted` / `patchVisibility` updates, or a
-- Studio edit — can forget to stamp it, and critically a *replayed* offline write
-- can never set it from a client clock (which would make the LWW comparison compare
-- server time to phone time). The server stamps it on every UPDATE, full stop.
--
-- No Data API grants here: these are ALTER TABLE, not CREATE TABLE, so the existing
-- grants stand. The trigger function needs no execute grant — the trigger invokes it.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- tours
alter table public.tours add column if not exists updated_at timestamptz not null default now();
create or replace trigger set_updated_at before update on public.tours
  for each row execute function public.set_updated_at();

-- contacts
alter table public.contacts add column if not exists updated_at timestamptz not null default now();
create or replace trigger set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

-- contact_methods
alter table public.contact_methods add column if not exists updated_at timestamptz not null default now();
create or replace trigger set_updated_at before update on public.contact_methods
  for each row execute function public.set_updated_at();

-- user_profile
alter table public.user_profile add column if not exists updated_at timestamptz not null default now();
create or replace trigger set_updated_at before update on public.user_profile
  for each row execute function public.set_updated_at();

-- friend_requests (accept flips status → an UPDATE that LWW must order)
alter table public.friend_requests add column if not exists updated_at timestamptz not null default now();
create or replace trigger set_updated_at before update on public.friend_requests
  for each row execute function public.set_updated_at();

-- The app reads tours through `tours_view`, so `updated_at` must be exposed there for
-- the client to capture `baseUpdatedAt` (DC5). CREATE OR REPLACE VIEW matches columns
-- by position and may only APPEND — so this reproduces the current view verbatim
-- (last defined in 20260526051944_add_tours_visibility.sql, ending in `visibility`)
-- and adds `updated_at` as the new final column. The create/update RPCs use named-
-- column INSERT/UPDATE, so the new column needs no RPC change (default now() on
-- insert, the trigger above on update).
create or replace view public.tours_view as
 select t.id,
    t.user_id,
    t.planned_date,
    t.name,
    extensions.st_x((t.goal)::extensions.geometry) as lon,
    extensions.st_y((t.goal)::extensions.geometry) as lat,
    t.tour_type,
    t.elevation,
    t.gpx_filepath,
    t.description,
    t.seasons,
    extensions.st_x((t.start_point)::extensions.geometry) as start_lon,
    extensions.st_y((t.start_point)::extensions.geometry) as start_lat,
    extensions.st_x((t.end_point)::extensions.geometry) as end_lon,
    extensions.st_y((t.end_point)::extensions.geometry) as end_lat,
    t.start_point_name,
    t.start_point_elevation,
    t.end_point_name,
    t.end_point_elevation,
    t.equipment,
    t.notes,
    t.completed,
    ( select coalesce(json_agg(tp.contact_id), '[]'::json)
        from public.tour_partners tp
       where tp.tour_id = t.id) as partner_ids,
    t.visibility,
    t.updated_at
   from public.tours t;
