-- Per-tour visibility: 'private' (owner-only) or 'friends' (readable by accepted friends).
-- Default 'friends'; mirrors the existing tour_type text + CHECK pattern. Extensible to 'public' later.

alter table public.tours
  add column visibility text not null default 'friends';

alter table public.tours
  add constraint tours_visibility_check check (visibility in ('private', 'friends'));

-- Expose visibility on the owner read view. CREATE OR REPLACE can only append columns,
-- so visibility is added at the end of the existing column list.
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
    t.visibility
   from public.tours t;
