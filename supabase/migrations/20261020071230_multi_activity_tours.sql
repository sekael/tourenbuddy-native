-- Multiple activity types per tour (issue #335, change multi-activity-tours).
--
-- `tours.tour_type text` (nullable) becomes `tours.tour_types text[]` (not null, default '{}').
-- The client writes the list in the picker's canonical order, so array equality below is
-- order-stable. An empty list plays the old null's role: an untyped tour matches nothing.
--
-- Layout: 1 column swap + views, 2 write RPCs (with stale-client compat), 3 tour-link
-- predicate / scans / triggers (equality → overlap), 4 meaningful-change check,
-- 5 suggestions (logical field `tour_type` keeps its name, its value becomes a JSON array).
--
-- Deploy order: this migration FIRST, frontend second. Stale (pre-#335) clients keep working
-- through `p_tour_type` and the views' `tour_type` column (design D2).
-- ponytail: compat shims; drop `p_tour_type` and the views' `tour_type` column in a follow-up
-- migration once no pre-#335 build is in the field.

-- ─── 1. Column swap ────────────────────────────────────────────────────────────────────────
-- ALTER COLUMN ... TYPE rewrites the table without firing row triggers — an UPDATE backfill
-- would run `set_updated_at` and turn every queued offline edit into an LWW loser (DC5).
-- The views and the CHECK depend on the column, so they go first and come back below.
drop view public.tours_view;
drop view public.friend_tours_view;

alter table public.tours drop constraint tours_tour_type_check;

alter table public.tours
  alter column tour_type type text[]
    using case when tour_type is null then '{}'::text[] else array[tour_type] end,
  alter column tour_type set default '{}',
  alter column tour_type set not null;

alter table public.tours rename column tour_type to tour_types;

alter table public.tours add constraint tours_tour_types_check check (
  tour_types <@ array[
    'skiing', 'snowboarding', 'skitour', 'splitboarding', 'ski-mountaineering', 'paragliding',
    'hiking', 'mountaineering', 'climbing', 'mountain-biking', 'trailrunning'
  ]::text[]
);

-- Both views are reproduced from their latest definitions with `tour_types` added and
-- `tour_type` kept as the primary (first) type for stale clients (compat, see header).
create view public.tours_view with (security_invoker = true) as
select t.id,
  t.user_id,
  t.planned_date,
  t.name,
  extensions.st_x(t.goal::extensions.geometry) as lon,
  extensions.st_y(t.goal::extensions.geometry) as lat,
  t.tour_types[1] as tour_type,
  t.elevation,
  t.gpx_filepath,
  t.description,
  t.seasons,
  extensions.st_x(t.start_point::extensions.geometry) as start_lon,
  extensions.st_y(t.start_point::extensions.geometry) as start_lat,
  extensions.st_x(t.end_point::extensions.geometry) as end_lon,
  extensions.st_y(t.end_point::extensions.geometry) as end_lat,
  t.start_point_name,
  t.start_point_elevation,
  t.end_point_name,
  t.end_point_elevation,
  t.equipment,
  t.notes,
  t.completed,
  (select coalesce(json_agg(tp.contact_id), '[]'::json)
     from public.tour_partners tp
    where tp.tour_id = t.id) as partner_ids,
  t.visibility,
  t.updated_at,
  t.end_date,
  t.tour_types
from public.tours t
where t.user_id = (select auth.uid());

create view public.friend_tours_view with (security_invoker = true) as
select t.id,
  t.user_id,
  case when p.is_partner then t.planned_date else null::date end as planned_date,
  t.name,
  extensions.st_x(t.goal::extensions.geometry) as lon,
  extensions.st_y(t.goal::extensions.geometry) as lat,
  t.tour_types[1] as tour_type,
  t.elevation,
  case when p.is_partner then t.gpx_filepath else null::text end as gpx_filepath,
  t.description,
  t.seasons,
  extensions.st_x(t.start_point::extensions.geometry) as start_lon,
  extensions.st_y(t.start_point::extensions.geometry) as start_lat,
  extensions.st_x(t.end_point::extensions.geometry) as end_lon,
  extensions.st_y(t.end_point::extensions.geometry) as end_lat,
  t.start_point_name,
  t.start_point_elevation,
  t.end_point_name,
  t.end_point_elevation,
  t.equipment,
  t.notes,
  t.completed,
  p.is_partner,
  case when p.is_partner then (
    select coalesce(json_agg(json_build_object(
      'userId', n.user_id, 'firstName', n.first_name, 'lastName', n.last_name
    )), '[]'::json)
    from public.tour_partner_names(t.id) n(user_id, first_name, last_name)
  ) else '[]'::json end as partner_names,
  t.visibility,
  case when p.is_partner then public.tour_unresolved_partner_count(t.id) else 0 end
    as unresolved_partner_count,
  case when p.is_partner then t.end_date else null::date end as end_date,
  t.tour_types
from public.tours t
cross join lateral (select public.is_tour_partner(t.id) as is_partner) p
where t.user_id <> auth.uid();

-- Recreated views get the schema's default ALL grant; restore read-only (security_hardening).
revoke all on public.tours_view, public.friend_tours_view from anon, authenticated;
grant select on public.tours_view, public.friend_tours_view to authenticated;

-- ─── 2. Write RPCs ─────────────────────────────────────────────────────────────────────────
-- A new trailing param changes the signature: DROP by the current (21-arg) signature, CREATE
-- with `p_tour_types` appended, re-grant (dropping a function drops its grants). Bodies are
-- the latest definitions (20260825131243) with only the type column changed.
--
-- `p_tour_types` wins when sent (the new client always sends it, possibly '{}'). When it is
-- null the caller is a stale client that only knows `p_tour_type`:
--  - create: a one-element list (or empty).
--  - update: if it echoes the current primary type, keep the whole list (a completed toggle
--    from a stale client must not drop the second activity); otherwise replace.
drop function public.create_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date
);
drop function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date
);

create function public.create_tour_full(
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
  p_end_date date default null,
  p_tour_types text[] default null
)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
begin
  insert into public.tours (
    id, planned_date, name, goal, user_id, tour_types, elevation, gpx_filepath,
    description, seasons, start_point, end_point, equipment, notes,
    start_point_name, start_point_elevation, end_point_name, end_point_elevation,
    visibility, completed, end_date
  ) values (
    p_id,
    p_planned_date,
    p_name,
    p_goal::geography,
    auth.uid(),
    coalesce(p_tour_types, array_remove(array[p_tour_type], null)),
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
$function$;

create function public.update_tour_full(
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
  p_end_date date default null,
  p_tour_types text[] default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
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
    tour_types            = coalesce(
      p_tour_types,
      case when p_tour_type is not distinct from v_old.tour_types[1] then v_old.tour_types
           else array_remove(array[p_tour_type], null) end
    ),
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
$function$;

grant execute on function public.create_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date, text[]
) to authenticated;
grant execute on function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date, text[]
) to authenticated;

-- ─── 3. Tour links: equality → overlap ─────────────────────────────────────────────────────
-- Same objective = share at least one activity (`&&`); '{}' overlaps nothing, like the old
-- null. Same signatures, so CREATE OR REPLACE keeps every existing grant.
create or replace function public.fn_collision_predicate(tour_a_id uuid, tour_b_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select
    a.id <> b.id
    and a.tour_types && b.tour_types
    and a.visibility = 'friends'
    and b.visibility = 'friends'
    and extensions.st_dwithin(a.goal, b.goal, 200)
    and exists (
      select 1 from public.friendships f
      where (f.request_user_id = a.user_id and f.response_user_id = b.user_id)
         or (f.request_user_id = b.user_id and f.response_user_id = a.user_id)
    )
  from public.tours a, public.tours b
  where a.id = tour_a_id and b.id = tour_b_id;
$function$;

create or replace function public.fn_scan_collisions_for_tour(p_tour_id uuid)
returns table(other_tour_id uuid, other_user_id uuid, other_tour_name text)
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select b.id, b.user_id, b.name
  from public.tours a
  join public.tours b on b.id <> a.id
  where a.id = p_tour_id
    and a.tour_types && b.tour_types
    and a.visibility = 'friends' and b.visibility = 'friends'
    and extensions.st_dwithin(a.goal, b.goal, 200)
    and exists (
      select 1 from public.friendships f
      where (f.request_user_id = a.user_id and f.response_user_id = b.user_id)
         or (f.request_user_id = b.user_id and f.response_user_id = a.user_id)
    );
$function$;

create or replace function public.fn_scan_backfill_collisions(p_user_a uuid, p_user_b uuid)
returns table(a_tour_id uuid, b_tour_id uuid)
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select ta.id, tb.id
  from public.tours ta
  join public.tours tb on tb.user_id = p_user_b
  where ta.user_id = p_user_a
    and ta.tour_types && tb.tour_types
    and ta.visibility = 'friends' and tb.visibility = 'friends'
    and extensions.st_dwithin(ta.goal, tb.goal, 200)
    and not exists (
      select 1
      from public.tour_link_member ma
      join public.tour_link_member mb on mb.group_id = ma.group_id
      where ma.tour_id = ta.id and mb.tour_id = tb.id
    )
    and not exists (
      select 1 from public.tour_link_request r
      where r.status = 'pending'
        and ((r.initiator_tour_id = ta.id and r.target_tour_id = tb.id)
          or (r.initiator_tour_id = tb.id and r.target_tour_id = ta.id))
    );
$function$;

create or replace function public.list_backfill_pairs_for_friendship(p_friendship_id uuid)
returns table(your_tour_id uuid, your_tour_name text, friend_tour_id uuid, friend_tour_name text, friend_user_id uuid)
language plpgsql
stable security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_user_a uuid;
  v_user_b uuid;
  v_me uuid := auth.uid();
  v_other uuid;
begin
  select fs.request_user_id, fs.response_user_id
    into v_user_a, v_user_b
  from public.friendships fs
  where fs.request_id = p_friendship_id
  limit 1;

  if v_user_a is null then
    return;
  end if;

  if v_me <> v_user_a and v_me <> v_user_b then
    raise exception 'tour_link.not_a_friendship_member' using errcode = '42501';
  end if;

  v_other := case when v_me = v_user_a then v_user_b else v_user_a end;

  return query
    select
      my.id, my.name, fr.id, fr.name, fr.user_id
    from public.tours my
    join public.tours fr on fr.user_id = v_other
    where my.user_id = v_me
      and my.tour_types && fr.tour_types
      and my.visibility = 'friends' and fr.visibility = 'friends'
      and extensions.st_dwithin(my.goal, fr.goal, 200)
      and not exists (
        select 1
        from public.tour_link_member ma
        join public.tour_link_member mb on mb.group_id = ma.group_id
        where ma.tour_id = my.id and mb.tour_id = fr.id
      )
      and not exists (
        select 1 from public.tour_link_request r
        where r.status = 'pending'
          and ((r.initiator_tour_id = my.id and r.target_tour_id = fr.id)
            or (r.initiator_tour_id = fr.id and r.target_tour_id = my.id))
      );
end;
$function$;

create or replace function public.list_all_backfill_pairs()
returns table(your_tour_id uuid, your_tour_name text, friend_tour_id uuid, friend_tour_name text, friend_user_id uuid, friendship_id uuid)
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  with friends as (
    select fs.request_id as friendship_id,
           case when fs.request_user_id = auth.uid() then fs.response_user_id
                else fs.request_user_id end as friend_user_id
      from public.friendships fs
     where fs.request_user_id = auth.uid() or fs.response_user_id = auth.uid()
  )
  select distinct
    my.id, my.name, fr.id, fr.name, fr.user_id, f.friendship_id
  from friends f
  join public.tours my on my.user_id = auth.uid()
  join public.tours fr on fr.user_id = f.friend_user_id
  where my.tour_types && fr.tour_types
    and my.visibility = 'friends' and fr.visibility = 'friends'
    and extensions.st_dwithin(my.goal, fr.goal, 200)
    and not exists (
      select 1
      from public.tour_link_member ma
      join public.tour_link_member mb on mb.group_id = ma.group_id
      where ma.tour_id = my.id and mb.tour_id = fr.id
    )
    and not exists (
      select 1 from public.tour_link_request r
      where r.status = 'pending'
        and ((r.initiator_tour_id = my.id and r.target_tour_id = fr.id)
          or (r.initiator_tour_id = fr.id and r.target_tour_id = my.id))
    );
$function$;

-- Eviction mirrors the goal rule: a type edit evicts only when the tour no longer shares an
-- activity with SOME sibling — adding a second activity never breaks a link.
create or replace function public.fn_evict_member_on_tour_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_group_id uuid;
  v_evict boolean := false;
begin
  select group_id into v_group_id from public.tour_link_member where tour_id = new.id;
  if v_group_id is null then
    return new;
  end if;

  if old.visibility = 'friends' and new.visibility <> 'friends' then
    v_evict := true;
  elsif new.tour_types is distinct from old.tour_types and exists (
    select 1
    from public.tour_link_member sib
    join public.tours st on st.id = sib.tour_id
    where sib.group_id = v_group_id and sib.tour_id <> new.id
      and not (new.tour_types && st.tour_types)
  ) then
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
$function$;

create or replace function public.fn_void_pending_requests_on_tour_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  r record;
begin
  -- Only react when a predicate-relevant column changed.
  if new.tour_types is not distinct from old.tour_types
     and new.visibility is not distinct from old.visibility
     and extensions.st_equals(new.goal::extensions.geometry, old.goal::extensions.geometry)
  then
    return new;
  end if;

  for r in
    select id, initiator_tour_id, target_tour_id
      from public.tour_link_request
     where status = 'pending'
       and (initiator_tour_id = new.id or target_tour_id = new.id)
  loop
    if not public.fn_collision_predicate(r.initiator_tour_id, r.target_tour_id) then
      update public.tour_link_request
         set status = 'withdrawn', resolved_at = now()
       where id = r.id;
    end if;
  end loop;

  return new;
end;
$function$;

-- ─── 4. Meaningful-change check ────────────────────────────────────────────────────────────
create or replace function public.fn_is_meaningful_tour_change(o public.tours, n public.tours, p_partners_changed boolean)
returns boolean
language sql
stable
set search_path to ''
as $function$
  select p_partners_changed
    or o.name is distinct from n.name
    or o.planned_date is distinct from n.planned_date
    or o.end_date is distinct from n.end_date
    or not coalesce(
      extensions.st_equals(o.goal::extensions.geometry, n.goal::extensions.geometry), false
    )
    -- Canonical order (client invariant), so array equality is order-stable.
    or o.tour_types is distinct from n.tour_types
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
$function$;

-- ─── 5. Suggestions ────────────────────────────────────────────────────────────────────────
-- The logical field stays `tour_type` (fields are logical, not columns — the CHECK and its
-- drift test are untouched); its value is now a JSON array of types.
create or replace function public.tour_field_value(p_tour_id uuid, p_field text)
returns jsonb
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select case p_field
    when 'name' then to_jsonb(t.name)
    when 'dates' then jsonb_build_object('plannedDate', t.planned_date, 'endDate', t.end_date)
    when 'goal' then jsonb_build_object(
      'lng', extensions.st_x(t.goal::extensions.geometry),
      'lat', extensions.st_y(t.goal::extensions.geometry),
      'elevation', t.elevation
    )
    when 'tour_type' then to_jsonb(t.tour_types)
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
$function$;

create or replace function public.fn_apply_tour_suggestion(p_id uuid, p_storage_path text)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  s public.tour_suggestion;
  v_removed text;
begin
  select * into s from public.tour_suggestion where id = p_id;

  case s.field
    when 'name' then
      update public.tours set name = s.value #>> '{}' where id = s.tour_id;
    when 'dates' then
      update public.tours set
        planned_date = (s.value->>'plannedDate')::date,
        end_date     = (s.value->>'endDate')::date
      where id = s.tour_id;
    when 'goal' then
      update public.tours set
        goal = extensions.st_setsrid(extensions.st_makepoint(
          (s.value->>'lng')::double precision, (s.value->>'lat')::double precision
        ), 4326)::extensions.geography,
        elevation = (s.value->>'elevation')::numeric
      where id = s.tour_id;
    when 'tour_type' then
      update public.tours set tour_types = case jsonb_typeof(s.value)
        when 'array' then array(select jsonb_array_elements_text(s.value))
        -- ponytail: a stale (pre-#335) client's scalar; drop with the other compat shims.
        when 'string' then array[s.value #>> '{}']
        else '{}'::text[]
      end where id = s.tour_id;
    when 'elevation' then
      update public.tours set elevation = (s.value #>> '{}')::numeric where id = s.tour_id;
    when 'description' then
      update public.tours set description = s.value #>> '{}' where id = s.tour_id;
    when 'seasons' then
      update public.tours set seasons = case
        when s.value is null then null
        else array(select jsonb_array_elements_text(s.value))
      end where id = s.tour_id;
    when 'equipment' then
      update public.tours set equipment = s.value #>> '{}' where id = s.tour_id;
    when 'notes' then
      update public.tours set notes = s.value #>> '{}' where id = s.tour_id;
    when 'start_point' then
      update public.tours set
        start_point = case when s.value is null then null else extensions.st_setsrid(
          extensions.st_makepoint((s.value->>'lng')::double precision, (s.value->>'lat')::double precision),
          4326)::extensions.geography end,
        start_point_name      = s.value->>'name',
        start_point_elevation = (s.value->>'elevation')::integer
      where id = s.tour_id;
    when 'end_point' then
      update public.tours set
        end_point = case when s.value is null then null else extensions.st_setsrid(
          extensions.st_makepoint((s.value->>'lng')::double precision, (s.value->>'lat')::double precision),
          4326)::extensions.geography end,
        end_point_name      = s.value->>'name',
        end_point_elevation = (s.value->>'elevation')::integer
      where id = s.tour_id;
    when 'gpx' then
      -- Replace semantics; a null value means "remove the track". The previous object is
      -- swept by the owner's client (the existing GPX replace path, tours-store.ts:495).
      select gpx_filepath into v_removed from public.tours where id = s.tour_id;
      update public.tours set
        gpx_filepath = case when s.value is null then null
          else coalesce(p_storage_path, s.value->>'storagePath') end
      where id = s.tour_id;
    when 'attachment_add' then
      insert into public.tour_attachments (
        tour_id, user_id, storage_path, mime_type, size_bytes, original_filename
      ) values (
        s.tour_id,
        s.owner_id,
        coalesce(p_storage_path, s.value->>'storagePath'),
        s.value->>'mimeType',
        (s.value->>'sizeBytes')::bigint,
        s.value->>'originalFilename'
      );
    when 'attachment_remove' then
      -- A remove whose target is already gone resolves accepted with no work: the intent
      -- was satisfied (D3).
      delete from public.tour_attachments
       where id = s.target_id and tour_id = s.tour_id
      returning storage_path into v_removed;
    else
      raise exception 'tour_suggestion.unknown_field' using errcode = 'P0001';
  end case;

  -- Touch the tour so an attachment-only accept still bumps updated_at and fires the
  -- friend-tour broadcast; every other branch already updated `tours`.
  if s.field in ('attachment_add', 'attachment_remove') then
    update public.tours set updated_at = now() where id = s.tour_id;
  end if;

  return v_removed;
end;
$function$;

-- Existing rows (pending AND history) carry scalars; lift both sides to arrays so the
-- view's staleness check (base_value vs tour_field_value) keeps comparing like with like.
update public.tour_suggestion set
  value = case jsonb_typeof(value)
    when 'string' then jsonb_build_array(value) when 'array' then value else '[]'::jsonb end,
  base_value = case jsonb_typeof(base_value)
    when 'string' then jsonb_build_array(base_value) when 'array' then base_value else '[]'::jsonb end
where field = 'tour_type';
