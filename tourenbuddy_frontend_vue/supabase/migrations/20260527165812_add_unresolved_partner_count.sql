-- Surface, to partner-viewers of a friend tour, a count of partner contacts that
-- cannot be shown as a name: those that do NOT resolve to a confirmed-phone
-- registered user. The friend roster (tour_partner_names) only ever lists
-- resolved partners; unresolvable address-book contacts vanish silently. This
-- count lets the UI render a generic "and X more" pill without exposing any
-- identity.
--
-- Mirrors tour_partner_names exactly: same SECURITY DEFINER authorization guard
-- (friends-visible tour, caller is a marked partner, friendship with the owner),
-- and the same phone-normalization + confirmed-phone resolution chain used by
-- tour_partner_user_ids. A definer function is required because friend_tours_view
-- is security_invoker: an inline count would run under the caller's RLS and could
-- not see other users' contact_methods / auth.users.

create or replace function public.tour_unresolved_partner_count(p_tour_id uuid)
  returns integer
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
  v_total integer;
  v_resolved integer;
begin
  select t.user_id, t.visibility into v_owner, v_visibility
  from public.tours t
  where t.id = p_tour_id;

  if v_owner is null then
    return 0;
  end if;

  v_partner_ids := public.tour_partner_user_ids(p_tour_id);

  -- Same guard as tour_partner_names: only an authorized partner-friend may learn
  -- anything about the roster, including its hidden size. Reveal 0 otherwise.
  if v_visibility <> 'friends'
    or v_caller is null
    or not (v_caller = any (v_partner_ids))
    or not exists (
      select 1 from public.friendships f
      where (f.request_user_id = v_caller and f.response_user_id = v_owner)
         or (f.request_user_id = v_owner and f.response_user_id = v_caller)
    )
  then
    return 0;
  end if;

  -- Total distinct partner contacts on the tour.
  select count(distinct tp.contact_id) into v_total
  from public.tour_partners tp
  where tp.tour_id = p_tour_id;

  -- Distinct partner contacts that DO resolve to a confirmed-phone user. The
  -- ltrim('+') + phone_confirmed_at join mirrors tour_partner_user_ids.
  select count(distinct tp.contact_id) into v_resolved
  from public.tour_partners tp
  join public.contact_methods cm
    on cm.contact_id = tp.contact_id
    and cm.method_type = 'phone'::public.contact_method_type
  join auth.users u
    on u.phone = ltrim(cm.value, '+')
    and u.phone_confirmed_at is not null
  where tp.tour_id = p_tour_id;

  return v_total - v_resolved;
end;
$$;

grant execute on function public.tour_unresolved_partner_count(uuid) to authenticated;
grant execute on function public.tour_unresolved_partner_count(uuid) to service_role;

-- Recreate the friend-read view, appending unresolved_partner_count (gated to
-- partner-viewers, 0 otherwise). Everything else is unchanged from the prior
-- definition in 20260526201110_fix_friend_tour_partner_names.sql.
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
    t.visibility,
    case when p.is_partner then public.tour_unresolved_partner_count(t.id) else 0 end
      as unresolved_partner_count
   from public.tours t
   cross join lateral (
     select pu as partner_ids,
            auth.uid() = any(pu) as is_partner
     from public.tour_partner_user_ids(t.id) as pu
   ) p
  where t.user_id <> auth.uid();

grant select on public.friend_tours_view to authenticated;
