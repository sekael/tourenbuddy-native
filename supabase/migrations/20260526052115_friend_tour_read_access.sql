-- Friend tour read authorization (two-layer authz).
--
-- Layer 1 (row visibility): a friend may SELECT an owner's tour iff an accepted
--   friendship exists AND tours.visibility = 'friends'. Enforced by RLS on `tours`.
-- Layer 2 (detail gating): planned_date / gpx_filepath / partner names are revealed
--   only to friends who are themselves a partner on the tour. Enforced in the
--   security_invoker friend-read view below, using the SECURITY DEFINER partner
--   resolver so the friend never reads the owner's private contacts directly.

-- ---------------------------------------------------------------------------
-- Layer 1: friend SELECT policy on tours (additive — ORs with tours_select_own)
-- ---------------------------------------------------------------------------
create policy "tours_select_friend" on public.tours
  for select to authenticated
  using (
    visibility = 'friends'
    and exists (
      select 1 from public.friendships f
      where (f.request_user_id = auth.uid() and f.response_user_id = tours.user_id)
         or (f.request_user_id = tours.user_id and f.response_user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Partner resolver: live tour_partners -> contact_methods(phone) -> auth.users
--   chain, returning the set of registered user ids marked as partners on a
--   tour (the caller included, if they are one — self-exclusion is a consumer
--   concern, not this resolver's). The `contacts` row itself is not traversed:
--   contact_methods links directly via contact_id, and only the phone matters.
--   SECURITY DEFINER so it can read the owner's private contact_methods; it
--   returns only user ids, so no contact data leaks to the caller. Phone
--   normalization (ltrim '+') + confirmed-phone gate mirror find_users_by_phones.
-- ---------------------------------------------------------------------------
create or replace function public.tour_partner_user_ids(p_tour_id uuid)
  returns uuid[]
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select coalesce(array_agg(distinct u.id), '{}'::uuid[])
  from public.tour_partners tp
  join public.contact_methods cm
    on cm.contact_id = tp.contact_id
    and cm.method_type = 'phone'::public.contact_method_type
  join auth.users u
    on u.phone = ltrim(cm.value, '+')
    and u.phone_confirmed_at is not null
  where tp.tour_id = p_tour_id;
$$;

grant execute on function public.tour_partner_user_ids(uuid) to authenticated;
grant execute on function public.tour_partner_user_ids(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Layer 2: friend-read view. security_invoker so the `tours_select_friend` RLS
--   policy filters rows under the caller's privileges (a non-friend gets zero
--   rows). Own tours are excluded — owners read via tours_view. Sensitive
--   columns are nulled for non-partner viewers; partners are surfaced as
--   registered-user profile names (never the owner's raw contact ids).
-- ---------------------------------------------------------------------------
create view public.friend_tours_view
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
      from public.get_user_names_by_ids(p.partner_ids) n
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

-- ---------------------------------------------------------------------------
-- GPX storage access for partner-friends. The bucket is otherwise owner-only
--   (split_part(name,'/',1) = auth.uid()); this additive policy lets a partner-
--   friend of a friends-visible tour download its track. Non-partner friends
--   and private tours stay blocked.
-- ---------------------------------------------------------------------------
create policy "tour-gpx partner friend select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tour-gpx'
    and exists (
      select 1 from public.tours t
      where t.gpx_filepath = storage.objects.name
        and t.visibility = 'friends'
        and t.user_id <> auth.uid()
        and exists (
          select 1 from public.friendships f
          where (f.request_user_id = auth.uid() and f.response_user_id = t.user_id)
             or (f.request_user_id = t.user_id and f.response_user_id = auth.uid())
        )
        and auth.uid() = any(public.tour_partner_user_ids(t.id))
    )
  );
