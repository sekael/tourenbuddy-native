-- Migration: Add extended fields to tours table (Issue #19)
-- All new columns are nullable for backward compatibility with existing tours.

-- 1. Add new columns to tours table
alter table public.tours
  add column if not exists tour_type text null
    constraint tours_tour_type_check check (
      tour_type is null or tour_type in (
        'skiing',
        'snowboarding',
        'skitour',
        'splitboarding',
        'ski-mountaineering',
        'paragliding',
        'hiking',
        'mountaineering',
        'climbing',
        'mountain-biking',
        'trailrunning'
      )
    ),
  add column if not exists elevation numeric null,
  add column if not exists gpx_track jsonb null,
  add column if not exists description text null,
  add column if not exists seasons text[] null,
  add column if not exists start_point geography(Point, 4326) null,
  add column if not exists end_point geography(Point, 4326) null,
  add column if not exists equipment text null,
  add column if not exists notes text null;

-- 2. Replace tours_view to include all new columns.
-- DROP + CREATE instead of CREATE OR REPLACE to avoid
-- "cannot change name of view column" error when adding columns.
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
  t.gpx_track,
  t.description,
  t.seasons,
  st_x(t.start_point::geometry) as start_lon,
  st_y(t.start_point::geometry) as start_lat,
  st_x(t.end_point::geometry) as end_lon,
  st_y(t.end_point::geometry) as end_lat,
  t.equipment,
  t.notes,
  (
    select coalesce(json_agg(tp.contact_id), '[]'::json)
    from tour_partners tp
    where tp.tour_id = t.id
  ) as partner_ids
from tours t;

-- 3. Create new RPC that accepts all tour fields.
-- Replaces create_tour_with_partners for new tour creation.
create or replace function public.create_tour_full(
  p_id uuid,
  p_planned_date date default null,
  p_name text default null,
  p_goal text default null,         -- WKT e.g. 'POINT(8.5 47.0)'
  p_partner_ids uuid[] default '{}',
  p_tour_type text default null,
  p_elevation numeric default null,
  p_gpx_track jsonb default null,
  p_description text default null,
  p_seasons text[] default null,
  p_start_point text default null,  -- WKT e.g. 'POINT(8.5 47.0)'
  p_end_point text default null,    -- WKT e.g. 'POINT(8.5 47.0)'
  p_equipment text default null,
  p_notes text default null
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
    gpx_track,
    description,
    seasons,
    start_point,
    end_point,
    equipment,
    notes
  ) values (
    p_id,
    p_planned_date,
    p_name,
    p_goal::geography,
    auth.uid(),
    p_tour_type,
    p_elevation,
    p_gpx_track,
    p_description,
    p_seasons,
    case when p_start_point is not null then p_start_point::geography else null end,
    case when p_end_point is not null then p_end_point::geography else null end,
    p_equipment,
    p_notes
  );

  -- Insert partner associations
  if array_length(p_partner_ids, 1) > 0 then
    insert into public.tour_partners (tour_id, contact_id)
    select p_id, unnest(p_partner_ids);
  end if;
end;
$$;
