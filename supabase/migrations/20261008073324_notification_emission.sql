-- Notification emission sites (change: notification-inbox, design D3).
--
-- Every event the client used to dispatch to the Worker is now recorded HERE, in the
-- transaction that caused it, through fn_emit_notification (previous migration). Emission
-- happens where the semantic event is visible: tour events in the tour RPCs (only place
-- that sees old row + new row + partner diff in one call), friend requests in row
-- triggers, link/suggestion events in their RPCs, group events at the eviction sites.
--
-- Every function re-created below is reproduced VERBATIM from its latest definition
-- (named per function) with only the emission added — `create or replace` with the same
-- signature, so existing grants stand. Every NEW helper is internal: the project's
-- default privileges grant EXECUTE to anon/authenticated, so each is revoked explicitly.
--
-- Layout: 1 shared helpers, 2 tours, 3 friend requests, 4 link requests + groups,
-- 5 suggestions, 6 block.

-- =====================================================================
-- 1. Shared helpers
-- =====================================================================

-- Tour partners who are registered users AND the owner's friends — the recipient set the
-- Worker resolved for every shared-tour event.
create function public.fn_friend_partner_ids(p_tour_id uuid, p_owner uuid)
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(array_agg(u), '{}'::uuid[])
  from unnest(public.tour_partner_user_ids(p_tour_id)) as u
  where exists (
    select 1 from public.friendships f
    where (f.request_user_id = p_owner and f.response_user_id = u)
       or (f.request_user_id = u and f.response_user_id = p_owner)
  );
$$;

-- Port of the deleted TS `isMeaningfulTourChange`: the partner-facing fields. Notes,
-- elevation, seasons, start/end detail are cosmetic/owner-private; completion is handled
-- by its caller; visibility never notifies. Partner change is passed in because partners
-- live in another table and only the caller saw the before/after sets.
create function public.fn_is_meaningful_tour_change(
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
    or o.equipment is distinct from n.equipment;
$$;

-- Shared-tour + collision events for one tour write. `p_old` is null on create;
-- `p_old_partners` are the partner USER ids before the write (users, not contacts: only
-- users can be notified, so adding a contact without an account changes nothing).
--
-- Semantics ported from tours-store `dispatchTourWriteNotifications` + the Worker:
--   - private tour: silent, no scan (covers "going private" too — checked on the NEW row)
--   - create: partners get `created`; collision scan
--   - meaningful edit OR completion flip: newly-added partners get `created`, the rest
--     `updated`; removed partners are silent (they are no longer partners)
--   - collision scan only on create / meaningful edit — never on a completion toggle
--   Behaviour fix vs. the client: the scan also runs for partnerless (solo) tours and on
--   replayed offline creates, as `tour-linking` always required.
create function public.fn_notify_tour_write(
  p_tour_id uuid,
  p_old public.tours,
  p_old_partners uuid[]
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_new public.tours;
  v_now_partners uuid[];
  v_recipients uuid[];
  v_added uuid[];
  v_meaningful boolean;
  r record;
begin
  select * into v_new from public.tours where id = p_tour_id;
  if not found or v_new.visibility <> 'friends' then
    return;
  end if;

  v_now_partners := public.tour_partner_user_ids(p_tour_id);
  v_recipients := public.fn_friend_partner_ids(p_tour_id, v_new.user_id);

  if p_old.id is null then
    v_meaningful := true;
    v_added := v_recipients;
  else
    v_meaningful := public.fn_is_meaningful_tour_change(
      p_old, v_new,
      not (v_now_partners @> p_old_partners and p_old_partners @> v_now_partners)
    );
    v_added := array(select unnest(v_recipients) except select unnest(p_old_partners));
  end if;

  if v_meaningful or p_old.completed is distinct from v_new.completed then
    perform public.fn_emit_notification(v_added, 'tour_updates', 'created', p_tour_id, v_new.name);
    perform public.fn_emit_notification(
      array(select unnest(v_recipients) except select unnest(v_added)),
      'tour_updates', 'updated', p_tour_id, v_new.name
    );
  end if;

  if v_meaningful then
    for r in select * from public.fn_scan_collisions_for_tour(p_tour_id) loop
      perform public.fn_emit_notification(
        array[r.other_user_id], 'tour_interest', 'collision', p_tour_id, v_new.name,
        jsonb_build_object('other_tour_id', r.other_tour_id)
      );
    end loop;
  end if;
exception when others then
  raise warning 'fn_notify_tour_write failed for %: %', p_tour_id, sqlerrm;
end;
$$;

-- One entry per member OWNER of a link group, each naming the recipient's OWN tour in the
-- group (the title they recognise). The actor is dropped by fn_emit_notification.
create function public.fn_emit_to_group(p_group_id uuid, p_action text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct on (t.user_id) t.user_id, t.id, t.name
    from public.tour_link_member m
    join public.tours t on t.id = m.tour_id
    where m.group_id = p_group_id
    order by t.user_id, m.joined_at
  loop
    perform public.fn_emit_notification(
      array[r.user_id], 'tour_interest', p_action, r.id, r.name,
      jsonb_build_object('group_id', p_group_id)
    );
  end loop;
exception when others then
  raise warning 'fn_emit_to_group failed for %: %', p_group_id, sqlerrm;
end;
$$;

-- Group-membership matrix (ported verbatim from tour-links-store + Worker): when tours
-- leave a group, every member owner (removed ones included) hears `group_dissolved` if
-- fewer than two tours remain, else `group_evicted_external`.
--
-- MUST be called BEFORE the member rows are deleted. A row trigger on tour_link_member
-- cannot do this: fn_dissolve_when_below_two cascades the last member away mid-statement
-- and an unfriend removes two rows in one statement, so the remaining set is already gone
-- (or double-counted) by the time an AFTER trigger runs.
create function public.fn_emit_group_removal(p_group_id uuid, p_removed_tour_ids uuid[])
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_remaining int;
begin
  if p_group_id is null then
    return;
  end if;
  select count(*) into v_remaining
  from public.tour_link_member
  where group_id = p_group_id and tour_id <> all(p_removed_tour_ids);

  perform public.fn_emit_to_group(
    p_group_id,
    case when v_remaining < 2 then 'group_dissolved' else 'group_evicted_external' end
  );
exception when others then
  raise warning 'fn_emit_group_removal failed for %: %', p_group_id, sqlerrm;
end;
$$;

revoke execute on function public.fn_friend_partner_ids(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fn_is_meaningful_tour_change(public.tours, public.tours, boolean)
  from public, anon, authenticated;
revoke execute on function public.fn_notify_tour_write(uuid, public.tours, uuid[])
  from public, anon, authenticated;
revoke execute on function public.fn_emit_to_group(uuid, text) from public, anon, authenticated;
revoke execute on function public.fn_emit_group_removal(uuid, uuid[]) from public, anon, authenticated;

-- =====================================================================
-- 2. Tours
-- =====================================================================

-- create_tour_full: verbatim from 20260825131243_add_tour_end_date.sql + emission.
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
  p_end_point_elevation integer default null,
  p_visibility text default null,
  p_completed boolean default null,
  p_end_date date default null
) returns void
  language plpgsql security definer
  as $$
begin
  insert into public.tours (
    id, planned_date, name, goal, user_id, tour_type, elevation, gpx_filepath,
    description, seasons, start_point, end_point, equipment, notes,
    start_point_name, start_point_elevation, end_point_name, end_point_elevation,
    visibility, completed, end_date
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
    p_end_point_elevation,
    -- ponytail: 'friends' mirrors the tours.visibility column default — keep in sync.
    coalesce(p_visibility, 'friends'),
    -- ponytail: false mirrors the tours.completed column default — keep in sync.
    coalesce(p_completed, false),
    p_end_date
  )
  on conflict (id) do nothing;

  -- idempotency: on a replayed create the row already exists (0 rows inserted, so
  -- FOUND is false). The original committed txn already inserted this tour AND its
  -- partners together, so re-inserting partners would duplicate — return the no-op.
  -- This early return is also what makes a replayed create emit exactly once.
  if not found then
    return;
  end if;

  if array_length(p_partner_ids, 1) > 0 then
    insert into public.tour_partners (tour_id, contact_id)
    select p_id, unnest(p_partner_ids);
  end if;

  perform public.fn_notify_tour_write(p_id, null, '{}'::uuid[]);
end;
$$;

-- update_tour_full: verbatim from 20260825131243_add_tour_end_date.sql + emission. The
-- owner lookup now reads the whole row (the "before" image for the meaningful-edit
-- filter) and the partner users are captured before the partner set is rewritten.
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
  p_end_point_elevation integer default null,
  p_visibility text default null,
  p_completed boolean default null,
  p_end_date date default null
) returns boolean
  language plpgsql security definer
  as $$
declare
  v_old public.tours;
  v_old_partners uuid[];
begin
  -- Update-only, owner-gated (design D3). Branch instead of a single
  -- WHERE id = p_id AND user_id = auth.uid() so we can tell "gone" (soft) from
  -- "not yours" (hard) — the latter is the SECURITY DEFINER auth gate.
  select * into v_old from public.tours where id = p_id;

  -- gone: soft no-op. Never insert, so a replayed update can't resurrect a deleted tour.
  if not found then
    return false;
  end if;

  -- not the owner: hard failure (SECURITY DEFINER bypasses RLS, this is the only gate).
  if v_old.user_id <> auth.uid() then
    raise exception 'Tour not found or access denied';
  end if;

  v_old_partners := public.tour_partner_user_ids(p_id);

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
    end_point_elevation   = p_end_point_elevation,
    -- Full-row overwrite, like every other nullable field above: an omitted p_end_date
    -- CLEARS the span. Deliberate — a coalesce would make "make this single-day again"
    -- impossible to express (design: Risks).
    end_date              = p_end_date,
    -- omitted visibility / completed (null) leave the existing value untouched (design D1).
    visibility            = coalesce(p_visibility, visibility),
    completed             = coalesce(p_completed, completed)
  where id = p_id;

  delete from public.tour_partners where tour_id = p_id;

  if p_partner_ids is not null and array_length(p_partner_ids, 1) > 0 then
    insert into public.tour_partners (tour_id, contact_id)
    select p_id, unnest(p_partner_ids);
  end if;

  perform public.fn_notify_tour_write(p_id, v_old, v_old_partners);

  return true;
end;
$$;

-- Tour deleted: BEFORE DELETE, while the row and its tour_partners / group membership are
-- still readable (the client used to cache them pre-delete for the Worker). Only an
-- owner's own delete emits — an account-deletion cascade or a service-role delete has no
-- matching auth.uid() and stays silent.
create function public.fn_notify_tour_deleted()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is distinct from old.user_id then
    return old;
  end if;

  begin
    if old.visibility = 'friends' then
      perform public.fn_emit_notification(
        public.fn_friend_partner_ids(old.id, old.user_id),
        'tour_updates', 'deleted', old.id, old.name
      );
    end if;
    perform public.fn_emit_group_removal(
      (select group_id from public.tour_link_member where tour_id = old.id),
      array[old.id]
    );
  exception when others then
    raise warning 'fn_notify_tour_deleted failed for %: %', old.id, sqlerrm;
  end;
  return old;
end;
$$;

revoke execute on function public.fn_notify_tour_deleted() from public, anon, authenticated;

create trigger trg_notify_tour_deleted
  before delete on public.tours
  for each row execute function public.fn_notify_tour_deleted();

-- =====================================================================
-- 3. Friend requests
-- =====================================================================

-- Row = event. `responded` covers both paths: accept (RPC) and deny (direct status
-- update). The outcome is never disclosed — same copy for accepted and denied (existing
-- spec). Cancellation is the sender withdrawing and notifies nobody.
create function public.fn_notify_friend_request()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'pending' then
      perform public.fn_emit_notification(
        array[new.to_user_id], 'friend_requests', 'received',
        p_ref := jsonb_build_object('request_id', new.id)
      );
    end if;
  elsif old.status = 'pending' and new.status in ('accepted', 'denied') then
    perform public.fn_emit_notification(
      array[new.from_user_id], 'friend_requests', 'responded',
      p_ref := jsonb_build_object('request_id', new.id)
    );
  end if;
  return null;
end;
$$;

revoke execute on function public.fn_notify_friend_request() from public, anon, authenticated;

create trigger trg_notify_friend_request
  after insert or update of status on public.friend_requests
  for each row execute function public.fn_notify_friend_request();

-- accept_friend_request: verbatim from 20260701062623_single_pending_friend_request_per_pair.sql
-- + the backfill digest. Both sides get one digest naming the OTHER side, so the
-- acceptor's own copy passes the requester as actor. friend_requests.id is the
-- friendship's stable identifier (friendships.request_id), which the deep link uses.
create or replace function public.accept_friend_request(p_request_id uuid) returns void
    language plpgsql security definer
    set search_path to ''
    as $$
declare
  v_caller_id uuid := auth.uid();
  v_from uuid;
  v_to uuid;
  v_status text;
  v_pairs int;
begin
  select from_user_id, to_user_id, status
  into v_from, v_to, v_status
  from public.friend_requests
  where id = p_request_id;

  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_caller_id <> v_to then
    raise exception 'Only the recipient can accept a friend request';
  end if;

  if v_status = 'accepted' then
    return; -- idempotent
  end if;

  if v_status <> 'pending' then
    raise exception 'Friend request is not pending';
  end if;

  update public.friend_requests
  set status = 'accepted', responded_at = now()
  where id = p_request_id;

  insert into public.friendships (request_user_id, response_user_id, request_id)
  values (v_from, v_to, p_request_id)
  on conflict (least(request_user_id, response_user_id), greatest(request_user_id, response_user_id))
  do nothing;

  -- Terminate any opposite-direction pending row for the same pair.
  update public.friend_requests
  set status = 'cancelled', responded_at = now()
  where from_user_id = v_to and to_user_id = v_from and status = 'pending';

  begin
    select count(*) into v_pairs from public.fn_scan_backfill_collisions(v_from, v_to);
    if v_pairs > 0 then
      perform public.fn_emit_notification(
        array[v_from], 'tour_interest', 'backfill',
        p_ref := jsonb_build_object('friendship_id', p_request_id, 'count', v_pairs)
      );
      perform public.fn_emit_notification(
        array[v_to], 'tour_interest', 'backfill',
        p_ref := jsonb_build_object('friendship_id', p_request_id, 'count', v_pairs),
        p_actor := v_from
      );
    end if;
  exception when others then
    raise warning 'backfill digest failed for %: %', p_request_id, sqlerrm;
  end;
end;
$$;

-- =====================================================================
-- 4. Link requests + groups
-- =====================================================================

-- create_link_request: verbatim from 20260528062747_tour_links.sql + `link_created` to the
-- target owner, naming THEIR tour.
create or replace function public.create_link_request(
  p_initiator_tour_id uuid,
  p_target_tour_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_initiator_owner uuid;
  v_request_id uuid;
  v_target public.tours;
begin
  select user_id into v_initiator_owner from public.tours where id = p_initiator_tour_id;
  if v_initiator_owner is null or v_initiator_owner <> auth.uid() then
    raise exception 'tour_link.not_initiator_owner' using errcode = '42501';
  end if;

  if not public.fn_collision_predicate(p_initiator_tour_id, p_target_tour_id) then
    raise exception 'tour_link.predicate_failed' using errcode = 'P0001';
  end if;

  if public.fn_would_merge_groups(p_initiator_tour_id, p_target_tour_id) then
    raise exception 'tour_link.merge_forbidden' using errcode = 'P0001';
  end if;

  insert into public.tour_link_request (initiator_tour_id, target_tour_id)
  values (p_initiator_tour_id, p_target_tour_id)
  returning id into v_request_id;

  select * into v_target from public.tours where id = p_target_tour_id;
  perform public.fn_emit_notification(
    array[v_target.user_id], 'tour_interest', 'link_created', v_target.id, v_target.name,
    jsonb_build_object('request_id', v_request_id, 'initiator_tour_id', p_initiator_tour_id)
  );

  return v_request_id;
end;
$$;

-- accept_link_request: verbatim from 20260528062747_tour_links.sql + `group_joined` to
-- every member owner except the acceptor. No separate `link_accepted`: in a two-tour link
-- the requester is also the only pre-existing member and would get both (the client
-- dropped it for that reason; kept).
create or replace function public.accept_link_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_target_owner uuid;
  v_group_id uuid;
  v_added uuid[] := '{}';
begin
  select * into v_req from public.tour_link_request where id = p_request_id and status = 'pending';
  if v_req is null then
    raise exception 'tour_link.request_not_pending' using errcode = 'P0001';
  end if;

  select user_id into v_target_owner from public.tours where id = v_req.target_tour_id;
  if v_target_owner is null or v_target_owner <> auth.uid() then
    raise exception 'tour_link.not_target_owner' using errcode = '42501';
  end if;

  if not public.fn_collision_predicate(v_req.initiator_tour_id, v_req.target_tour_id) then
    raise exception 'tour_link.predicate_failed' using errcode = 'P0001';
  end if;

  if public.fn_would_merge_groups(v_req.initiator_tour_id, v_req.target_tour_id) then
    raise exception 'tour_link.merge_forbidden' using errcode = 'P0001';
  end if;

  -- Resolve existing group (at most one side may be grouped — merge case already rejected).
  select group_id into v_group_id
  from public.tour_link_member
  where tour_id in (v_req.initiator_tour_id, v_req.target_tour_id)
  limit 1;

  if v_group_id is null then
    insert into public.tour_link_group default values returning id into v_group_id;
  end if;

  -- Attach both tours; existing member row (the grouped side) is a no-op.
  with ins as (
    insert into public.tour_link_member (group_id, tour_id)
    values (v_group_id, v_req.initiator_tour_id), (v_group_id, v_req.target_tour_id)
    on conflict (tour_id) do nothing
    returning tour_id
  )
  select coalesce(array_agg(tour_id), '{}') into v_added from ins;

  update public.tour_link_request
     set status = 'accepted', resolved_at = now()
   where id = p_request_id;

  perform public.fn_emit_to_group(v_group_id, 'group_joined');

  return jsonb_build_object('group_id', v_group_id, 'added_tour_ids', v_added);
end;
$$;

-- decline_link_request: verbatim from 20260528062747_tour_links.sql + `link_declined` to
-- the initiator owner, naming THEIR tour. Withdraw stays silent (unchanged).
create or replace function public.decline_link_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_owner uuid;
  v_initiator public.tours;
begin
  select t.user_id into v_target_owner
  from public.tour_link_request r
  join public.tours t on t.id = r.target_tour_id
  where r.id = p_request_id and r.status = 'pending';

  if v_target_owner is null or v_target_owner <> auth.uid() then
    raise exception 'tour_link.not_target_owner' using errcode = '42501';
  end if;

  update public.tour_link_request
     set status = 'declined', resolved_at = now()
   where id = p_request_id;

  select t.* into v_initiator
  from public.tour_link_request r
  join public.tours t on t.id = r.initiator_tour_id
  where r.id = p_request_id;
  perform public.fn_emit_notification(
    array[v_initiator.user_id], 'tour_interest', 'link_declined', v_initiator.id, v_initiator.name,
    jsonb_build_object('request_id', p_request_id)
  );
end;
$$;

-- fn_evict_member_on_tour_change: verbatim from 20260529063812_bump_tour_link_radius_to_200m.sql
-- + group notification computed BEFORE the member row goes.
create or replace function public.fn_evict_member_on_tour_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_group_id uuid;
  v_evict boolean := false;
begin
  select group_id into v_group_id from public.tour_link_member where tour_id = new.id;
  if v_group_id is null then
    return new;
  end if;

  if new.tour_type is distinct from old.tour_type then
    v_evict := true;
  elsif old.visibility = 'friends' and new.visibility <> 'friends' then
    v_evict := true;
  elsif not extensions.st_equals(new.goal::extensions.geometry, old.goal::extensions.geometry) then
    if exists (
      select 1
      from public.tour_link_member sib
      join public.tours st on st.id = sib.tour_id
      where sib.group_id = v_group_id and sib.tour_id <> new.id
        and not extensions.st_dwithin(new.goal, st.goal, 200)
    ) then
      v_evict := true;
    end if;
  end if;

  if v_evict then
    perform public.fn_emit_group_removal(v_group_id, array[new.id]);
    delete from public.tour_link_member where tour_id = new.id;
    perform public.fn_void_pending_requests_for_tour(new.id);
  end if;

  return new;
end;
$$;

-- fn_evict_on_friendship_delete: from 20260528062747_tour_links.sql, restructured from
-- per-PAIR to per-GROUP so each group is announced once, before its rows go. Same rows
-- evicted: a tour of either ex-friend that shares a group with a tour of the other is
-- exactly "every tour of either user in a group containing both".
create or replace function public.fn_evict_on_friendship_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_removed uuid[];
  v_tour uuid;
begin
  for v_group_id in
    select distinct ma.group_id
    from public.tour_link_member ma
    join public.tours ta on ta.id = ma.tour_id
    join public.tour_link_member mb on mb.group_id = ma.group_id and mb.tour_id <> ma.tour_id
    join public.tours tb on tb.id = mb.tour_id
    where ta.user_id = old.request_user_id and tb.user_id = old.response_user_id
  loop
    select array_agg(m.tour_id) into v_removed
    from public.tour_link_member m
    join public.tours t on t.id = m.tour_id
    where m.group_id = v_group_id
      and t.user_id in (old.request_user_id, old.response_user_id);

    perform public.fn_emit_group_removal(v_group_id, v_removed);

    delete from public.tour_link_member where tour_id = any(v_removed);
    foreach v_tour in array v_removed loop
      perform public.fn_void_pending_requests_for_tour(v_tour);
    end loop;
  end loop;

  perform public.fn_void_pending_requests_for_pair(old.request_user_id, old.response_user_id);
  return old;
end;
$$;

-- =====================================================================
-- 5. Suggestions (design D16, ported from tour-suggestions-store)
-- =====================================================================

-- `suggestion_resolved` to each batch's author, only for batches that just became FULLY
-- resolved (the caller passes fn_resolved_batches output). Partial resolution is silent.
create function public.fn_emit_suggestions_resolved(p_batch_ids uuid[])
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select distinct on (s.batch_id) s.batch_id, s.suggester_id, s.tour_id, t.name
    from public.tour_suggestion s
    join public.tours t on t.id = s.tour_id
    where s.batch_id = any(p_batch_ids)
  loop
    perform public.fn_emit_notification(
      array[r.suggester_id], 'tour_suggestions', 'suggestion_resolved', r.tour_id, r.name,
      jsonb_build_object('batch_id', r.batch_id)
    );
  end loop;
exception when others then
  raise warning 'fn_emit_suggestions_resolved failed: %', sqlerrm;
end;
$$;

-- An accepted partner-facing field is a tour change like any other: the OTHER friend
-- partners get `tour_updates/updated`. The authors are excluded — they already have their
-- own suggestion notice (D16). Same field set as the deleted TS `isMeaningfulSuggestionField`.
create function public.fn_emit_suggestion_tour_update(
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
  if not (p_fields && array['name', 'dates', 'goal', 'tour_type', 'gpx', 'description', 'equipment']) then
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

revoke execute on function public.fn_emit_suggestions_resolved(uuid[]) from public, anon, authenticated;
revoke execute on function public.fn_emit_suggestion_tour_update(uuid, text[], uuid[])
  from public, anon, authenticated;

-- upsert_tour_suggestions: verbatim from 20260828054413_tour_suggestions.sql +
-- `suggestion_submitted` to the owner for a NEW batch only. A revision (the author
-- already holds pending rows in this batch) is silent: the owner knows the batch exists
-- and their review sheet updates live.
create or replace function public.upsert_tour_suggestions(
  p_tour_id uuid,
  p_batch_id uuid,
  p_items jsonb
) returns jsonb
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_owner uuid;
  v_item jsonb;
  v_field text;
  v_target uuid;
  v_pending int;
  v_is_new boolean;
begin
  v_owner := public.fn_assert_can_suggest(p_tour_id);

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'tour_suggestion.invalid_items' using errcode = 'P0001';
  end if;

  v_is_new := not exists (
    select 1 from public.tour_suggestion
    where batch_id = p_batch_id and suggester_id = auth.uid() and status = 'pending'
  );

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_field := v_item->>'field';
    v_target := nullif(v_item->>'targetId', '')::uuid;

    insert into public.tour_suggestion (
      tour_id, owner_id, suggester_id, batch_id, field, value, base_value, target_id
    ) values (
      p_tour_id,
      v_owner,
      auth.uid(),
      p_batch_id,
      v_field,
      case when v_item->'value' = 'null'::jsonb then null else v_item->'value' end,
      public.tour_field_value(p_tour_id, v_field),
      v_target
    )
    on conflict (
      tour_id, suggester_id, field, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) where status = 'pending'
    do update set
      batch_id   = excluded.batch_id,
      value      = excluded.value,
      -- Refresh the base on revision (D4): a just-revised proposal is never stale.
      base_value = excluded.base_value;
  end loop;

  -- Fields reverted to the tour's own value are absent from p_items — withdraw them.
  update public.tour_suggestion s
     set status = 'withdrawn', resolved_at = now()
   where s.tour_id = p_tour_id
     and s.suggester_id = auth.uid()
     and s.status = 'pending'
     and not exists (
       select 1 from jsonb_array_elements(p_items) i
       where i->>'field' = s.field
         and nullif(i->>'targetId', '')::uuid is not distinct from s.target_id
     );

  select count(*) into v_pending
  from public.tour_suggestion s
  where s.tour_id = p_tour_id and s.suggester_id = auth.uid() and s.status = 'pending';

  if v_is_new and jsonb_array_length(p_items) > 0 then
    perform public.fn_emit_notification(
      array[v_owner], 'tour_suggestions', 'suggestion_submitted', p_tour_id,
      (select name from public.tours where id = p_tour_id),
      jsonb_build_object('batch_id', p_batch_id)
    );
  end if;

  return jsonb_build_object('batch_id', p_batch_id, 'pending_count', v_pending);
end;
$$;

-- accept_tour_suggestion: verbatim from 20260828054413_tour_suggestions.sql + emission.
-- The resolved-batch list is computed once and serves both the return and the emission.
create or replace function public.accept_tour_suggestion(
  p_id uuid,
  p_storage_path text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  s public.tour_suggestion;
  v_removed text;
  v_batches uuid[];
  v_resolved uuid[];
begin
  select * into s from public.tour_suggestion where id = p_id;

  if s.id is null then
    raise exception 'tour_suggestion.not_found' using errcode = 'P0001';
  end if;
  if s.owner_id <> auth.uid() then
    raise exception 'tour_suggestion.not_owner' using errcode = '42501';
  end if;
  if s.status <> 'pending' then
    raise exception 'tour_suggestion.already_resolved' using errcode = 'P0001';
  end if;
  if not (s.suggester_id = any(public.tour_partner_user_ids(s.tour_id))) then
    raise exception 'tour_suggestion.not_partner' using errcode = '42501';
  end if;

  v_removed := public.fn_apply_tour_suggestion(p_id, p_storage_path);

  update public.tour_suggestion
     set status = 'accepted', resolved_at = now()
   where id = p_id;

  -- D7 — same field, same target, any author.
  with declined as (
    update public.tour_suggestion o
       set status = 'declined', resolved_at = now()
     where o.tour_id = s.tour_id
       and o.field = s.field
       and o.target_id is not distinct from s.target_id
       and o.status = 'pending'
       and o.id <> p_id
    returning o.batch_id
  )
  select coalesce(array_agg(distinct batch_id), '{}'::uuid[]) into v_batches from declined;

  v_resolved := public.fn_resolved_batches(v_batches || s.batch_id);
  perform public.fn_emit_suggestions_resolved(v_resolved);
  perform public.fn_emit_suggestion_tour_update(s.tour_id, array[s.field], array[s.suggester_id]);

  return jsonb_build_object(
    'tour_id', s.tour_id,
    'field', s.field,
    'removed_storage_path', v_removed,
    'resolved_batches', v_resolved
  );
end;
$$;

-- accept_tour_suggestion_batch: verbatim from 20260828054413_tour_suggestions.sql +
-- emission, once per call (not per field).
create or replace function public.accept_tour_suggestion_batch(
  p_batch_id uuid,
  p_storage_paths jsonb default '{}'::jsonb
) returns jsonb
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  r record;
  v_tour_id uuid;
  v_owner uuid;
  v_author uuid;
  v_removed text;
  v_removed_paths text[] := '{}';
  v_fields text[] := '{}';
  v_batches uuid[] := '{}';
  v_resolved uuid[];
begin
  select distinct tour_id, owner_id, suggester_id into v_tour_id, v_owner, v_author
  from public.tour_suggestion where batch_id = p_batch_id and status = 'pending';

  if v_tour_id is null then
    raise exception 'tour_suggestion.already_resolved' using errcode = 'P0001';
  end if;
  if v_owner <> auth.uid() then
    raise exception 'tour_suggestion.not_owner' using errcode = '42501';
  end if;

  for r in
    select id, field, target_id, batch_id, tour_id
    from public.tour_suggestion
    where batch_id = p_batch_id and status = 'pending'
    order by case field
      when 'attachment_remove' then 0
      when 'attachment_add' then 2
      else 1
    end, created_at
  loop
    v_removed := public.fn_apply_tour_suggestion(r.id, p_storage_paths->>(r.id::text));
    if v_removed is not null then
      v_removed_paths := v_removed_paths || v_removed;
    end if;
    v_fields := v_fields || r.field;

    update public.tour_suggestion set status = 'accepted', resolved_at = now() where id = r.id;

    with declined as (
      update public.tour_suggestion o
         set status = 'declined', resolved_at = now()
       where o.tour_id = r.tour_id
         and o.field = r.field
         and o.target_id is not distinct from r.target_id
         and o.status = 'pending'
         and o.id <> r.id
      returning o.batch_id
    )
    select v_batches || coalesce(array_agg(distinct batch_id), '{}'::uuid[]) into v_batches
    from declined;
  end loop;

  v_resolved := public.fn_resolved_batches(v_batches || p_batch_id);
  perform public.fn_emit_suggestions_resolved(v_resolved);
  perform public.fn_emit_suggestion_tour_update(v_tour_id, v_fields, array[v_author]);

  return jsonb_build_object(
    'tour_id', v_tour_id,
    'fields', to_jsonb(v_fields),
    'removed_storage_paths', to_jsonb(v_removed_paths),
    'resolved_batches', v_resolved
  );
end;
$$;

-- decline_tour_suggestion: verbatim from 20260828054413_tour_suggestions.sql + emission.
create or replace function public.decline_tour_suggestion(p_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  s public.tour_suggestion;
  v_resolved uuid[];
begin
  select * into s from public.tour_suggestion where id = p_id;

  if s.id is null then
    raise exception 'tour_suggestion.not_found' using errcode = 'P0001';
  end if;
  if s.owner_id <> auth.uid() then
    raise exception 'tour_suggestion.not_owner' using errcode = '42501';
  end if;
  if s.status <> 'pending' then
    raise exception 'tour_suggestion.already_resolved' using errcode = 'P0001';
  end if;

  update public.tour_suggestion
     set status = 'declined', resolved_at = now()
   where id = p_id;

  v_resolved := public.fn_resolved_batches(array[s.batch_id]);
  perform public.fn_emit_suggestions_resolved(v_resolved);

  return jsonb_build_object('resolved_batches', v_resolved);
end;
$$;

-- =====================================================================
-- 6. Block (D9)
-- =====================================================================

-- block_user: verbatim from 20260522045948_block_user_security_definer.sql + removal of
-- the blocker's entries caused by the target (snapshotted names must not outlive a block).
create or replace function public.block_user(target uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if target = auth.uid() then
    raise exception 'cannot block yourself' using errcode = 'P0001';
  end if;

  if not public.is_phone_verified(auth.uid()) then
    raise exception 'phone_not_verified' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('block:' || least(auth.uid()::text, target::text)
                      || ':' || greatest(auth.uid()::text, target::text))
  );

  if exists (
    select 1 from public.user_blocks
    where blocker_user_id = auth.uid()
      and blocked_user_id = target
      and unblocked_at is null
  ) then
    raise exception 'already_blocked' using errcode = 'P0001';
  end if;

  perform public.terminate_pending_and_friendship_between(auth.uid(), array[target]);

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (auth.uid(), target)
  on conflict (blocker_user_id, blocked_user_id) do update
    set unblocked_at    = null,
        last_blocked_at = now();

  delete from public.notifications
   where recipient_id = auth.uid() and actor_id = target;
end;
$$;
