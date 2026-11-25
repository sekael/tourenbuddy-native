-- Security hardening (review 2026-10-12). Every hole below was reproduced against the local
-- stack as `anon` / an unrelated `authenticated` user before this fix.
--
-- Layout: 1 tours_view (critical), 2 function EXECUTE grants, 3 tour_field_value gate,
-- 4 tour_attachments write policies, 5 friend_requests direct writes, 6 storage read
-- policies, 7 search_path pins + attachment cap trigger fix, 8 tour-gpx bucket size cap.

-- =====================================================================
-- 1. tours_view — CRITICAL
-- =====================================================================
-- The view was created without `security_invoker`, so it ran as its owner (postgres, which
-- bypasses RLS on its own tables), and the baseline granted it ALL to anon. Being a simple
-- single-table view it is also auto-updatable: anyone holding the public anon key could
-- SELECT, UPDATE and DELETE every user's tours through /rest/v1/tours_view (and GraphQL),
-- the 20261008073323 base-table revokes notwithstanding.
--
-- security_invoker puts RLS and the base-table privileges back in charge. The owner filter
-- is required with it: tours_select_friend would otherwise add friends' tours to the OWNER
-- read surface, ungated (friends read friend_tours_view). Columns verbatim from
-- 20260825131243_add_tour_end_date.sql, same order.
create or replace view public.tours_view
  with (security_invoker = true) as
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
    t.updated_at,
    t.end_date
   from public.tours t
  where t.user_id = (select auth.uid());

-- Read surfaces only: writes go through the tour RPCs. The two invoker views got the same
-- default ALL grant; harmless today (RLS + not updatable), tightened alongside.
revoke all on public.tours_view, public.friend_tours_view, public.tour_suggestion_view
  from anon, authenticated;
grant select on public.tours_view, public.friend_tours_view, public.tour_suggestion_view
  to authenticated;

-- =====================================================================
-- 2. Function EXECUTE grants
-- =====================================================================
-- The baseline's default privileges grant EXECUTE on every new public function to anon and
-- authenticated (plus PostgreSQL's own PUBLIC default), so `revoke ... from public` alone
-- never closed anything. Helpers documented as internal were therefore callable by anyone:
--   - terminate_pending_and_friendship_between(actor, peers): delete ANY friendship and
--     cancel/deny any pending request — no caller check, anon included.
--   - fn_apply_tour_suggestion(id, path): writes a suggestion into the owner's tour with no
--     owner, status or partner check — a partner could self-accept, with any storage path.
--   - fn_void_pending_requests_for_*: withdraw anyone's link requests.
--   - fn_scan_* / users_by_contact_ids: leak other users' tours and contact→user links.
-- All are only called from SECURITY DEFINER functions/triggers (which execute as postgres)
-- or by the service role, so revoking client access changes no app behaviour.
revoke execute on function
  public.terminate_pending_and_friendship_between(uuid, uuid[]),
  public.fn_apply_tour_suggestion(uuid, text),
  public.fn_void_pending_requests_for_tour(uuid),
  public.fn_void_pending_requests_for_pair(uuid, uuid),
  public.fn_void_broken_tour_suggestions(uuid[]),
  public.fn_collision_predicate(uuid, uuid),
  public.fn_would_merge_groups(uuid, uuid),
  public.fn_resolved_batches(uuid[]),
  public.fn_assert_can_suggest(uuid),
  public.fn_scan_collisions_for_tour(uuid),
  public.fn_scan_backfill_collisions(uuid, uuid),
  public.users_by_contact_ids(uuid[])
  from public, anon, authenticated;

-- Signed-out clients call no RPC (every client RPC requires a session), and no RLS policy
-- reachable by anon calls a public function. Closing anon wholesale removes the remaining
-- oracles (is_phone_verified, tour_partner_user_ids, ...) for unauthenticated callers.
revoke execute on all functions in schema public from public, anon;

-- Fail closed from here on: a new function is callable only after an explicit
-- `grant execute ... to authenticated` (and/or service_role) in its migration. The global
-- form is required for PUBLIC — a per-schema default cannot revoke a global default.
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

-- =====================================================================
-- 3. tour_field_value — authorize the caller
-- =====================================================================
-- tour_suggestion_view (security_invoker) calls it as the caller, so authenticated keeps
-- EXECUTE — but it took any tour id and returned its notes/dates/gpx path. It now returns
-- NULL unless the caller may see the tour's full detail: the owner, or a partner-friend of
-- a friends-visible tour (the fn_assert_can_suggest predicate). Body otherwise verbatim from
-- 20260828054413_tour_suggestions.sql; same signature, so the grants stand.
create or replace function public.tour_field_value(p_tour_id uuid, p_field text)
  returns jsonb
  language sql
  stable
  security definer
  set search_path = public, extensions
as $$
  select case p_field
    when 'name' then to_jsonb(t.name)
    when 'dates' then jsonb_build_object('plannedDate', t.planned_date, 'endDate', t.end_date)
    when 'goal' then jsonb_build_object(
      'lng', extensions.st_x(t.goal::extensions.geometry),
      'lat', extensions.st_y(t.goal::extensions.geometry),
      'elevation', t.elevation
    )
    when 'tour_type' then to_jsonb(t.tour_type)
    when 'elevation' then to_jsonb(t.elevation)
    when 'description' then to_jsonb(t.description)
    when 'seasons' then to_jsonb(t.seasons)
    when 'equipment' then to_jsonb(t.equipment)
    when 'notes' then to_jsonb(t.notes)
    when 'start_point' then case when t.start_point is null then null else jsonb_build_object(
      'lng', extensions.st_x(t.start_point::extensions.geometry),
      'lat', extensions.st_y(t.start_point::extensions.geometry),
      'name', t.start_point_name,
      'elevation', t.start_point_elevation
    ) end
    when 'end_point' then case when t.end_point is null then null else jsonb_build_object(
      'lng', extensions.st_x(t.end_point::extensions.geometry),
      'lat', extensions.st_y(t.end_point::extensions.geometry),
      'name', t.end_point_name,
      'elevation', t.end_point_elevation
    ) end
    when 'gpx' then case when t.gpx_filepath is null then null
      else jsonb_build_object('storagePath', t.gpx_filepath) end
    else null
  end
  from public.tours t
  where t.id = p_tour_id
    and (
      t.user_id = auth.uid()
      or (
        t.visibility = 'friends'
        and exists (
          select 1 from public.friendships f
          where (f.request_user_id = auth.uid() and f.response_user_id = t.user_id)
             or (f.request_user_id = t.user_id and f.response_user_id = auth.uid())
        )
        and auth.uid() = any(public.tour_partner_user_ids(t.id))
      )
    );
$$;

-- =====================================================================
-- 4. tour_attachments — the row's tour must be the caller's
-- =====================================================================
-- Insert/update only checked user_id, not tour_id: a user could attach rows to someone
-- else's tour, which tour_attachments_select_partner_friend then showed to that tour's
-- partners (content injection) and which counted against nobody's 5-file cap.
alter policy tour_attachments_insert_own on public.tour_attachments
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.tours t where t.id = tour_id and t.user_id = auth.uid())
  );

alter policy tour_attachments_update_own on public.tour_attachments
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.tours t where t.id = tour_id and t.user_id = auth.uid())
  );

-- =====================================================================
-- 5. friend_requests — direct writes limited to the status transition
-- =====================================================================
-- The update policies only checked the NEW status, so a sender/recipient could also rewrite
-- from_user_id / to_user_id (forging a `responded` notification to any user via the
-- trigger), and a recipient could set 'accepted' without the friendship the accept RPC
-- creates. The client only ever writes status (+ responded_at) directly: deny and cancel.
-- Accept, send and every other transition go through RPCs.
revoke update on public.friend_requests from anon, authenticated;
grant update (status, responded_at) on public.friend_requests to authenticated;

alter policy friend_requests_update_recipient on public.friend_requests
  with check (status = 'denied');

-- A direct insert could also start in any status; send_friend_request inserts 'pending'.
alter policy friend_requests_insert on public.friend_requests
  with check (
    status = 'pending'
    and auth.uid() = from_user_id
    and public.is_phone_verified(auth.uid())
    and public.is_phone_verified(to_user_id)
    and not exists (
      select 1 from public.user_blocks
      where blocker_user_id = to_user_id
        and blocked_user_id = from_user_id
        and unblocked_at is null
    )
  );

-- =====================================================================
-- 6. Storage reads — the object must live in the right user's prefix
-- =====================================================================
-- These grants matched objects by a path stored in a row the requester (or an accomplice)
-- controls: tours.gpx_filepath, tour_attachments.storage_path, and the suggester-supplied
-- tour_suggestion.value->>'storagePath'. Two cooperating accounts could point such a row at
-- any other user's private object and read it. Every legitimate path starts with its
-- owner's uid (`<uid>/<tourId>.gpx`, `<uid>/<tourId>/<id>.<ext>`, staged suggestions under
-- `<suggester uid>/suggestions/`), so pin the first segment.
drop policy "tour-gpx partner friend select" on storage.objects;
create policy "tour-gpx partner friend select" on storage.objects
  for select to authenticated
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
        and auth.uid() = any(public.tour_partner_user_ids(t.id))
    )
  );

drop policy "tour-attachments partner friend select" on storage.objects;
create policy "tour-attachments partner friend select" on storage.objects
  for select to authenticated
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
        and auth.uid() = any (public.tour_partner_user_ids(t.id))
    )
  );

drop policy "tour-gpx suggestion owner select" on storage.objects;
create policy "tour-gpx suggestion owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tour-gpx'
    and exists (
      select 1 from public.tour_suggestion s
      where s.owner_id = auth.uid()
        and s.status = 'pending'
        and s.field = 'gpx'
        and s.value->>'storagePath' = storage.objects.name
        and split_part(storage.objects.name, '/', 1) = s.suggester_id::text
    )
  );

drop policy "tour-attachments suggestion owner select" on storage.objects;
create policy "tour-attachments suggestion owner select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tour-attachments'
    and exists (
      select 1 from public.tour_suggestion s
      where s.owner_id = auth.uid()
        and s.status = 'pending'
        and s.field = 'attachment_add'
        and s.value->>'storagePath' = storage.objects.name
        and split_part(storage.objects.name, '/', 1) = s.suggester_id::text
    )
  );

-- =====================================================================
-- 7. Pin search_path on the functions that never set one
-- =====================================================================
-- The two tour RPCs are SECURITY DEFINER and resolved `geography` through the caller's
-- search_path. Bodies are unchanged (fully qualified apart from the extension type).
alter function public.create_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text,
  text, text, text, integer, text, integer, text, boolean, date
) set search_path = public, extensions;
alter function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text,
  text, text, text, integer, text, integer, text, boolean, date
) set search_path = public, extensions;
alter function public.set_updated_at() set search_path = '';

-- The attachment cap trigger ran as the caller. Since 20261008073323 revoked UPDATE on
-- `tours`, its `SELECT ... FOR UPDATE` parent lock raises "permission denied for table
-- tours" — every owner attachment upload failed (only suggestion accepts, which run as
-- definer, still worked). Its count was also RLS-filtered to the caller's visible rows.
-- As definer it locks and counts the tour's real rows. Body unchanged (fully qualified).
alter function public.check_tour_attachment_limit() security definer set search_path = '';

-- =====================================================================
-- 8. tour-gpx bucket size cap
-- =====================================================================
-- The bucket had no limit (only the 50 MiB project cap), so any user could fill the
-- project's storage quota through their own prefix. 10 MiB mirrors tour-attachments and is
-- far above a real track. No MIME allowlist: staged suggestion uploads keep the picked
-- file's own type.
update storage.buckets set file_size_limit = 10485760 where id = 'tour-gpx';
