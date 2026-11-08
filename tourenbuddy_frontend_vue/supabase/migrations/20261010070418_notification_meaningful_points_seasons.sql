-- Seasons and start / end points are partner-facing changes (change: notification-inbox,
-- follow-up). Before a planned date exists the seasons are what partners plan around, and a
-- moved start or end point is a changed meeting point. Point elevations stay silent: they
-- are auto-filled from the point, which itself notifies. Notes / tour elevation stay silent.
--
-- Both functions verbatim from 20261008073324_notification_emission.sql plus these fields;
-- `create or replace`, same signatures, so grants and callers stand.

create or replace function public.fn_is_meaningful_tour_change(
  o public.tours,
  n public.tours,
  p_partners_changed boolean
) returns boolean
  language sql
  stable
  set search_path = ''
as $$
  select p_partners_changed
    or o.name is distinct from n.name
    or o.planned_date is distinct from n.planned_date
    or o.end_date is distinct from n.end_date
    or not coalesce(
      extensions.st_equals(o.goal::extensions.geometry, n.goal::extensions.geometry), false
    )
    or o.tour_type is distinct from n.tour_type
    or o.gpx_filepath is distinct from n.gpx_filepath
    or o.description is distinct from n.description
    or o.equipment is distinct from n.equipment
    or o.seasons is distinct from n.seasons
    -- Text form, not st_equals: both points are optional, and st_equals(null, null) is
    -- null — which would flag every save of a tour without a start point.
    or extensions.st_astext(o.start_point::extensions.geometry)
       is distinct from extensions.st_astext(n.start_point::extensions.geometry)
    or extensions.st_astext(o.end_point::extensions.geometry)
       is distinct from extensions.st_astext(n.end_point::extensions.geometry)
    or o.start_point_name is distinct from n.start_point_name
    or o.end_point_name is distinct from n.end_point_name;
$$;

create or replace function public.fn_emit_suggestion_tour_update(
  p_tour_id uuid,
  p_fields text[],
  p_authors uuid[]
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_tour public.tours;
begin
  if not (p_fields && array[
    'name', 'dates', 'goal', 'tour_type', 'gpx', 'description', 'equipment',
    'seasons', 'start_point', 'end_point'
  ]) then
    return;
  end if;
  select * into v_tour from public.tours where id = p_tour_id;
  if not found or v_tour.visibility <> 'friends' then
    return;
  end if;
  perform public.fn_emit_notification(
    array(
      select unnest(public.fn_friend_partner_ids(p_tour_id, v_tour.user_id))
      except select unnest(p_authors)
    ),
    'tour_updates', 'updated', p_tour_id, v_tour.name
  );
exception when others then
  raise warning 'fn_emit_suggestion_tour_update failed for %: %', p_tour_id, sqlerrm;
end;
$$;
