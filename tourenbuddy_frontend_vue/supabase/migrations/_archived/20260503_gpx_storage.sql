-- Migration: GPX Storage (Issue #61)
-- Move GPX from inline JSONB to Supabase Storage.
-- No GPX data in production → atomic column flip, no backfill.

-- 1. Replace gpx_track jsonb with gpx_filepath text
alter table public.tours
  drop column if exists gpx_track,
  add column gpx_filepath text null;

-- 2. Recreate tours_view with gpx_filepath instead of gpx_track
drop view if exists public.tours_view;

create view public.tours_view as
select
  t.id,
  t.user_id,
  t.planned_date,
  t.name,
  st_x(t.goal::geometry) as lon,
  st_y(t.goal::geometry) as lat,
  t.tour_type,
  t.elevation,
  t.gpx_filepath,
  t.description,
  t.seasons,
  st_x(t.start_point::geometry) as start_lon,
  st_y(t.start_point::geometry) as start_lat,
  st_x(t.end_point::geometry) as end_lon,
  st_y(t.end_point::geometry) as end_lat,
  t.start_point_name,
  t.start_point_elevation,
  t.end_point_name,
  t.end_point_elevation,
  t.equipment,
  t.notes,
  t.completed,
  (
    select coalesce(json_agg(tp.contact_id), '[]'::json)
    from tour_partners tp
    where tp.tour_id = t.id
  ) as partner_ids
from tours t;

-- 3. Helper: extract tour UUID from storage object name "${tourId}.gpx"
create or replace function public.tour_id_from_gpx_path(p_name text)
returns uuid
language sql
immutable
as $$
  select (regexp_replace(p_name, '\.gpx$', '', 'i'))::uuid
$$;

-- 4. RLS policies on storage.objects for the tour-gpx bucket
-- Note: bucket must be created in Supabase dashboard or via API (cannot be created in SQL migration).
-- Policy: SELECT — owner can read their tour's GPX
create policy "tour-gpx owner select"
  on storage.objects
  for select
  using (
    bucket_id = 'tour-gpx'
    and exists (
      select 1 from public.tours t
      where t.id = public.tour_id_from_gpx_path(name)
        and t.user_id = auth.uid()
    )
  );

-- Policy: INSERT — owner can upload their tour's GPX
create policy "tour-gpx owner insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'tour-gpx'
    and exists (
      select 1 from public.tours t
      where t.id = public.tour_id_from_gpx_path(name)
        and t.user_id = auth.uid()
    )
  );

-- Policy: UPDATE — owner can overwrite their tour's GPX
create policy "tour-gpx owner update"
  on storage.objects
  for update
  using (
    bucket_id = 'tour-gpx'
    and exists (
      select 1 from public.tours t
      where t.id = public.tour_id_from_gpx_path(name)
        and t.user_id = auth.uid()
    )
  );

-- Policy: DELETE — owner can delete their tour's GPX
create policy "tour-gpx owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'tour-gpx'
    and exists (
      select 1 from public.tours t
      where t.id = public.tour_id_from_gpx_path(name)
        and t.user_id = auth.uid()
    )
  );

-- 5. Trigger: cascade delete Storage object when tour row is deleted
create or replace function public.delete_tour_gpx_object()
returns trigger
language plpgsql
security definer
as $$
begin
  if old.gpx_filepath is not null then
    perform storage.delete_object('tour-gpx', old.gpx_filepath);
  end if;
  return old;
end;
$$;

create or replace trigger trg_delete_tour_gpx
  after delete on public.tours
  for each row
  execute function public.delete_tour_gpx_object();

-- 6. Update create_tour_full: replace p_gpx_track jsonb with p_gpx_filepath text
create or replace function public.create_tour_full(
  p_id uuid,
  p_planned_date date default null,
  p_name text default null,
  p_goal text default null,
  p_partner_ids uuid[] default '{}',
  p_tour_type text default null,
  p_elevation numeric default null,
  p_gpx_filepath text default null,
  p_description text default null,
  p_seasons text[] default null,
  p_start_point text default null,
  p_end_point text default null,
  p_equipment text default null,
  p_notes text default null,
  p_start_point_name text default null,
  p_start_point_elevation integer default null,
  p_end_point_name text default null,
  p_end_point_elevation integer default null
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.tours (
    id,
    planned_date,
    name,
    goal,
    user_id,
    tour_type,
    elevation,
    gpx_filepath,
    description,
    seasons,
    start_point,
    end_point,
    equipment,
    notes,
    start_point_name,
    start_point_elevation,
    end_point_name,
    end_point_elevation
  ) values (
    p_id,
    p_planned_date,
    p_name,
    p_goal::geography,
    auth.uid(),
    p_tour_type,
    p_elevation,
    p_gpx_filepath,
    p_description,
    p_seasons,
    case when p_start_point is not null then p_start_point::geography else null end,
    case when p_end_point is not null then p_end_point::geography else null end,
    p_equipment,
    p_notes,
    p_start_point_name,
    p_start_point_elevation,
    p_end_point_name,
    p_end_point_elevation
  );

  if array_length(p_partner_ids, 1) > 0 then
    insert into public.tour_partners (tour_id, contact_id)
    select p_id, unnest(p_partner_ids);
  end if;
end;
$$;

-- 7. Update update_tour_full: replace p_gpx_track jsonb with p_gpx_filepath text
create or replace function public.update_tour_full(
  p_id uuid,
  p_planned_date date default null,
  p_name text default null,
  p_goal text default null,
  p_partner_ids uuid[] default '{}',
  p_tour_type text default null,
  p_elevation numeric default null,
  p_gpx_filepath text default null,
  p_description text default null,
  p_seasons text[] default null,
  p_start_point text default null,
  p_end_point text default null,
  p_equipment text default null,
  p_notes text default null,
  p_start_point_name text default null,
  p_start_point_elevation integer default null,
  p_end_point_name text default null,
  p_end_point_elevation integer default null
)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from public.tours where id = p_id and user_id = auth.uid()
  ) then
    raise exception 'Tour not found or access denied';
  end if;

  update public.tours set
    planned_date          = p_planned_date,
    name                  = p_name,
    goal                  = p_goal::geography,
    tour_type             = p_tour_type,
    elevation             = p_elevation,
    gpx_filepath          = p_gpx_filepath,
    description           = p_description,
    seasons               = p_seasons,
    start_point           = case when p_start_point is not null then p_start_point::geography else null end,
    end_point             = case when p_end_point   is not null then p_end_point::geography   else null end,
    equipment             = p_equipment,
    notes                 = p_notes,
    start_point_name      = p_start_point_name,
    start_point_elevation = p_start_point_elevation,
    end_point_name        = p_end_point_name,
    end_point_elevation   = p_end_point_elevation
  where id = p_id;

  delete from public.tour_partners where tour_id = p_id;

  if p_partner_ids is not null and array_length(p_partner_ids, 1) > 0 then
    insert into public.tour_partners (tour_id, contact_id)
    select p_id, unnest(p_partner_ids);
  end if;
end;
$$;
