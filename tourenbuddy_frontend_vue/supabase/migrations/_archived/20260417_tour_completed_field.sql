ALTER TABLE tours ADD COLUMN completed boolean NOT NULL DEFAULT false;

DROP VIEW IF EXISTS public.tours_view;

CREATE VIEW public.tours_view AS
SELECT
  id,
  user_id,
  planned_date,
  name,
  st_x(goal::geometry) AS lon,
  st_y(goal::geometry) AS lat,
  tour_type,
  elevation,
  gpx_track,
  description,
  seasons,
  st_x(start_point::geometry) AS start_lon,
  st_y(start_point::geometry) AS start_lat,
  st_x(end_point::geometry) AS end_lon,
  st_y(end_point::geometry) AS end_lat,
  equipment,
  notes,
  completed,
  (
    SELECT COALESCE(json_agg(tp.contact_id), '[]'::json)
    FROM tour_partners tp
    WHERE tp.tour_id = t.id
  ) AS partner_ids
FROM tours t;
