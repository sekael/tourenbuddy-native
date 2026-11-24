-- tour_partner_user_ids roster leak (follow-up to 20261012144059_security_hardening.sql).
--
-- tour_partner_user_ids(tour) returns a tour's registered-partner roster without checking the
-- caller, and `authenticated` held EXECUTE because friend_tours_view (security_invoker) and
-- three partner-friend read policies call it AS the caller. Any friend holding a tour id
-- (friend_tours_view returns it to non-partners too) could read the roster Layer 2 hides
-- from them; get_user_names_by_ids then names the ids that are also their friends.
--
-- Those four caller-context sites only ask "is the CALLER a partner?". They now ask exactly
-- that through is_tour_partner — one bit about the caller themself — and the roster function
-- loses its client grant. Its other callers are all SECURITY DEFINER (incl. the pg_cron
-- reminder / weekly-summary jobs, where auth.uid() is null): they run as the owner, need no
-- grant, and keep calling it unchanged. See docs/supabase-rpc-authorization.md.

create function public.is_tour_partner(p_tour_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce((select auth.uid()) = any (public.tour_partner_user_ids(p_tour_id)), false);
$$;

grant execute on function public.is_tour_partner(uuid) to authenticated;

-- Columns verbatim from 20260825131243_add_tour_end_date.sql; only the lateral changes.
-- create or replace keeps the view's ACL (SELECT to authenticated, 20261012144059).
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
      as unresolved_partner_count,
    case when p.is_partner then t.end_date end as end_date
   from public.tours t
   cross join lateral (select public.is_tour_partner(t.id) as is_partner) p
  where t.user_id <> auth.uid();

-- Predicates otherwise verbatim (storage ones from 20261012144059).
alter policy tour_attachments_select_partner_friend on public.tour_attachments
  using (
    exists (
      select 1 from public.tours t
      where t.id = tour_attachments.tour_id
        and t.visibility = 'friends'
        and t.user_id <> auth.uid()
        and exists (
          select 1 from public.friendships f
          where (f.request_user_id = auth.uid() and f.response_user_id = t.user_id)
             or (f.request_user_id = t.user_id and f.response_user_id = auth.uid())
        )
        and public.is_tour_partner(t.id)
    )
  );

alter policy "tour-gpx partner friend select" on storage.objects
  using (
    bucket_id = 'tour-gpx'
    and exists (
      select 1 from public.tours t
      where t.gpx_filepath = storage.objects.name
        and split_part(storage.objects.name, '/', 1) = t.user_id::text
        and t.visibility = 'friends'
        and t.user_id <> auth.uid()
        and exists (
          select 1 from public.friendships f
          where (f.request_user_id = auth.uid() and f.response_user_id = t.user_id)
             or (f.request_user_id = t.user_id and f.response_user_id = auth.uid())
        )
        and public.is_tour_partner(t.id)
    )
  );

alter policy "tour-attachments partner friend select" on storage.objects
  using (
    bucket_id = 'tour-attachments'
    and exists (
      select 1
      from public.tour_attachments a
      join public.tours t on t.id = a.tour_id
      where a.storage_path = storage.objects.name
        and split_part(storage.objects.name, '/', 1) = t.user_id::text
        and t.visibility = 'friends'
        and t.user_id <> auth.uid()
        and exists (
          select 1 from public.friendships f
          where (f.request_user_id = auth.uid() and f.response_user_id = t.user_id)
             or (f.request_user_id = t.user_id and f.response_user_id = auth.uid())
        )
        and public.is_tour_partner(t.id)
    )
  );

revoke execute on function public.tour_partner_user_ids(uuid) from authenticated;
