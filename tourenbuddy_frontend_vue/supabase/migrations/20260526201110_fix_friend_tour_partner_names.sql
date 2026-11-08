-- Fix: friend_tours_view returned no partner_names for an authorized partner-viewer.
--
-- The view delegated name lookup to get_user_names_by_ids(), which is a
-- *caller-relationship-scoped* resolver: it only returns a profile the CALLER is
-- friends with (or has a pending request from), and excludes the caller itself.
-- Tour co-partners are friends of the tour OWNER, not necessarily of each other,
-- so that predicate wrongly filtered every partner out (incl. the viewer).
--
-- A tour's partner roster should be visible in full once the view has already
-- authorized the viewer as a partner-friend. Introduce a tour-scoped resolver
-- that self-authorizes (caller must be a partner on a friends-visible tour they
-- are a friend of the owner on) and then returns ALL partner names, with no
-- per-partner caller-friendship gate.

create or replace function public.tour_partner_names(p_tour_id uuid)
  returns table(user_id uuid, first_name text, last_name text)
  language plpgsql
  stable
  security definer
  set search_path to ''
as $$
declare
  v_caller uuid := auth.uid();
  v_owner uuid;
  v_visibility text;
  v_partner_ids uuid[];
begin
  select t.user_id, t.visibility into v_owner, v_visibility
  from public.tours t
  where t.id = p_tour_id;

  if v_owner is null then
    return;
  end if;

  v_partner_ids := public.tour_partner_user_ids(p_tour_id);

  -- Authorize the caller directly (SECURITY DEFINER bypasses RLS, so this guard
  -- is the only thing standing between an arbitrary caller and the roster):
  -- the tour must be friends-visible, the caller must be a partner on it, and a
  -- friendship with the owner must exist. Otherwise reveal nothing.
  if v_visibility <> 'friends'
    or v_caller is null
    or not (v_caller = any (v_partner_ids))
    or not exists (
      select 1 from public.friendships f
      where (f.request_user_id = v_caller and f.response_user_id = v_owner)
         or (f.request_user_id = v_owner and f.response_user_id = v_caller)
    )
  then
    return;
  end if;

  return query
  select up.id, up.first_name, up.last_name
  from public.user_profile up
  where up.id = any (v_partner_ids);
end;
$$;

grant execute on function public.tour_partner_names(uuid) to authenticated;
grant execute on function public.tour_partner_names(uuid) to service_role;

-- Recreate the friend-read view, swapping the partner-name source to the new
-- tour-scoped resolver. Everything else is unchanged from the original
-- definition (security_invoker, sensitive-column gating, own-tour exclusion).
create or replace view public.friend_tours_view
  with (security_invoker = true) as
 select t.id,
    t.user_id,
    case when p.is_partner then t.planned_date end as planned_date,
    t.name,
    extensions.st_x((t.goal)::extensions.geometry) as lon,
    extensions.st_y((t.goal)::extensions.geometry) as lat,
    t.tour_type,
    t.elevation,
    case when p.is_partner then t.gpx_filepath end as gpx_filepath,
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
    p.is_partner,
    case when p.is_partner then (
      select coalesce(
        json_agg(json_build_object(
          'userId', n.user_id,
          'firstName', n.first_name,
          'lastName', n.last_name
        )),
        '[]'::json)
      from public.tour_partner_names(t.id) n
    ) else '[]'::json end as partner_names,
    t.visibility
   from public.tours t
   cross join lateral (
     select pu as partner_ids,
            auth.uid() = any(pu) as is_partner
     from public.tour_partner_user_ids(t.id) as pu
   ) p
  where t.user_id <> auth.uid();

grant select on public.friend_tours_view to authenticated;
