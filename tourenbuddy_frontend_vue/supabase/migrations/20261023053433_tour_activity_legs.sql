-- Activities per leg (change: activity-legs, design D1–D6).
--
-- A hike & fly walks from the start to the goal and flies from the goal to the end. A tour may
-- now say which activities it uses on the way up (start → goal) and on the way down (goal →
-- end). Both legs are set together or not at all; `tour_types` stays their union, so every
-- reader of `tour_types` (filters, colours, the Worker, older apps) is unchanged.
--
-- Stale writers (D2): `update_tour_full` is a full-row overwrite. A caller that knows no legs
-- (null) keeps them while its `tour_types` is still their union and clears them otherwise —
-- legs never contradict the activities. `{}` clears.
--
-- Deploy order: before the frontend. Old frontends never send the new arguments.

-- ─── 1. Columns ────────────────────────────────────────────────────────────────────────────
-- Nullable, no default: metadata-only ADD COLUMN, `updated_at` (the LWW baseline) untouched.
-- Values are checked through the union: `tours_tour_types_check` covers `tour_types`.
alter table public.tours
  add column ascent_types text[],
  add column descent_types text[],
  -- Spelled so no part is NULL for a half-set pair: a NULL CHECK passes.
  add constraint tours_legs_check check (
    (ascent_types is null) = (descent_types is null)
    and (ascent_types is null or (
      cardinality(ascent_types) > 0 and cardinality(descent_types) > 0
      and tour_types @> ascent_types and tour_types @> descent_types
      and tour_types <@ (ascent_types || descent_types)
    ))
  );

-- ─── 2. Views ──────────────────────────────────────────────────────────────────────────────
-- Reproduced from 20261022192018 with the two legs appended; as public as `tour_types`.
drop view public.tours_view;
drop view public.friend_tours_view;

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
  t.tour_types,
  t.outing_id,
  t.outing_name,
  t.outing_position,
  t.grade,
  to_char(t.start_time, 'HH24:MI') as start_time,
  t.ascent_types,
  t.descent_types
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
  t.tour_types,
  t.outing_id,
  t.outing_name,
  t.outing_position,
  t.grade,
  case when p.is_partner then to_char(t.start_time, 'HH24:MI') else null::text end as start_time,
  t.ascent_types,
  t.descent_types
from public.tours t
cross join lateral (select public.is_tour_partner(t.id) as is_partner) p
where t.user_id <> auth.uid();

-- Recreated views get the schema's default ALL grant; restore read-only (security_hardening).
revoke all on public.tours_view, public.friend_tours_view from anon, authenticated;
grant select on public.tours_view, public.friend_tours_view to authenticated;


-- ─── 3. Write RPCs ─────────────────────────────────────────────────────────────────────────
-- Trailing `p_ascent_types`, `p_descent_types`. DROP by the 25-arg signature, CREATE with the
-- new arguments, re-grant. Bodies are 20261022192018's with the legs added.
drop function public.create_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date, text[], jsonb, text, text
);
drop function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date, text[], jsonb, text, text
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
  p_tour_types text[] default null,
  p_outing jsonb default null,
  p_grade text default null,
  p_start_time text default null,
  p_ascent_types text[] default null,
  p_descent_types text[] default null
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
    visibility, completed, end_date, outing_id, outing_name, outing_position,
    grade, start_time, ascent_types, descent_types
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
    p_end_date,
    -- null / {} → standalone. A segment without a position fails the CHECK (23514).
    (p_outing->>'id')::uuid,
    case when p_outing->>'id' is not null then nullif(btrim(p_outing->>'name'), '') end,
    case when p_outing->>'id' is not null then (p_outing->>'position')::integer end,
    nullif(btrim(p_grade), ''),
    case when p_planned_date is not null then nullif(p_start_time, '')::time end,
    -- null / {} → not split; legs that aren't the activities' union fail tours_legs_check.
    nullif(p_ascent_types, '{}'),
    nullif(p_descent_types, '{}')
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
  p_tour_types text[] default null,
  p_outing jsonb default null,
  p_grade text default null,
  p_start_time text default null,
  p_ascent_types text[] default null,
  p_descent_types text[] default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_old public.tours;
  v_old_partners uuid[];
  v_types text[];
  v_keep_legs boolean;
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

  v_types := coalesce(
    p_tour_types,
    case when p_tour_type is not distinct from v_old.tour_types[1] then v_old.tour_types
         else array_remove(array[p_tour_type], null) end
  );
  -- A caller that knows no legs keeps them only while they still add up to its activities (D2).
  v_keep_legs := coalesce(
    v_types @> v_old.ascent_types and v_types @> v_old.descent_types
    and v_types <@ (v_old.ascent_types || v_old.descent_types),
    false
  );

  update public.tours set
    planned_date          = p_planned_date,
    name                  = p_name,
    goal                  = p_goal::geography,
    tour_types            = v_types,
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
    completed             = coalesce(p_completed, completed),
    -- null = the caller predates outings (stale build, pre-#338 queued draft): keep (D12).
    outing_id             = case when p_outing is null then outing_id
                                 else (p_outing->>'id')::uuid end,
    outing_name           = case when p_outing is null then outing_name
                                 when p_outing->>'id' is not null then nullif(btrim(p_outing->>'name'), '') end,
    outing_position       = case when p_outing is null then outing_position
                                 when p_outing->>'id' is not null then (p_outing->>'position')::integer end,
    -- null = the caller predates grades and times: keep. '' = clear (D5).
    grade                 = case when p_grade is null then grade else nullif(btrim(p_grade), '') end,
    -- No date, no time — even for a stale caller that keeps the time (tours_start_time_check).
    start_time            = case when p_planned_date is null then null
                                 when p_start_time is null then start_time
                                 else nullif(p_start_time, '')::time end,
    ascent_types          = case when p_ascent_types is not null then nullif(p_ascent_types, '{}')
                                 when v_keep_legs then ascent_types end,
    descent_types         = case when p_descent_types is not null then nullif(p_descent_types, '{}')
                                 when v_keep_legs then descent_types end
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
  text, integer, text, integer, text, boolean, date, text[], jsonb, text, text, text[], text[]
) to authenticated;
grant execute on function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date, text[], jsonb, text, text, text[], text[]
) to authenticated;

-- ─── 4. Meaningful change ──────────────────────────────────────────────────────────────────
-- 20261022192018's body plus the legs: "we fly down now" is news for every partner.
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
    or o.ascent_types is distinct from n.ascent_types
    or o.descent_types is distinct from n.descent_types
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
    or o.end_point_name is distinct from n.end_point_name
    or o.grade is distinct from n.grade
    or o.start_time is distinct from n.start_time;
$function$;

-- ─── 5. Suggestions (D6) ───────────────────────────────────────────────────────────────────
-- 20261022192018's body; `tour_type` of a split tour is {types, ascent, descent}, of an unsplit
-- one the plain array as before, so pending suggestions on unsplit tours stay fresh.
create or replace function public.tour_field_value(p_tour_id uuid, p_field text)
returns jsonb
language sql
stable security definer
set search_path to 'public', 'extensions'
as $function$
  select case p_field
    when 'name' then to_jsonb(t.name)
    when 'dates' then jsonb_build_object('plannedDate', t.planned_date, 'endDate', t.end_date)
      || case when t.start_time is null then '{}'::jsonb
              else jsonb_build_object('startTime', to_char(t.start_time, 'HH24:MI')) end
    when 'goal' then jsonb_build_object(
      'lng', extensions.st_x(t.goal::extensions.geometry),
      'lat', extensions.st_y(t.goal::extensions.geometry),
      'elevation', t.elevation
    )
    when 'tour_type' then case when t.ascent_types is null then to_jsonb(t.tour_types)
      else jsonb_build_object('types', t.tour_types, 'ascent', t.ascent_types, 'descent', t.descent_types) end
    when 'elevation' then to_jsonb(t.elevation)
    when 'description' then to_jsonb(t.description)
    when 'seasons' then to_jsonb(t.seasons)
    when 'equipment' then to_jsonb(t.equipment)
    when 'notes' then to_jsonb(t.notes)
    when 'grade' then to_jsonb(t.grade)
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

-- 20261022192018's body; `tour_type` sets the legs from an object value, and an array (an
-- unsplit proposal, or a stale client's) keeps them only while they still add up (D2).
create or replace function public.fn_apply_tour_suggestion(p_id uuid, p_storage_path text)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  s public.tour_suggestion;
  v_removed text;
  v_types text[];
begin
  select * into s from public.tour_suggestion where id = p_id;

  case s.field
    when 'name' then
      update public.tours set name = s.value #>> '{}' where id = s.tour_id;
    when 'dates' then
      update public.tours set
        planned_date = (s.value->>'plannedDate')::date,
        end_date     = (s.value->>'endDate')::date,
        start_time   = case when s.value->>'plannedDate' is null then null
                            when s.value ? 'startTime' then (s.value->>'startTime')::time
                            else start_time end
      where id = s.tour_id;
    when 'goal' then
      update public.tours set
        goal = extensions.st_setsrid(extensions.st_makepoint(
          (s.value->>'lng')::double precision, (s.value->>'lat')::double precision
        ), 4326)::extensions.geography,
        elevation = (s.value->>'elevation')::numeric
      where id = s.tour_id;
    when 'tour_type' then
      if jsonb_typeof(s.value) = 'object' then
        update public.tours set
          tour_types    = array(select jsonb_array_elements_text(s.value->'types')),
          ascent_types  = case when jsonb_typeof(s.value->'ascent') = 'array'
            then nullif(array(select jsonb_array_elements_text(s.value->'ascent')), '{}') end,
          descent_types = case when jsonb_typeof(s.value->'descent') = 'array'
            then nullif(array(select jsonb_array_elements_text(s.value->'descent')), '{}') end
        where id = s.tour_id;
      else
        v_types := case jsonb_typeof(s.value)
          when 'array' then array(select jsonb_array_elements_text(s.value))
          -- ponytail: a stale (pre-#335) client's scalar; drop with the other compat shims.
          when 'string' then array[s.value #>> '{}']
          else '{}'::text[]
        end;
        update public.tours set
          tour_types    = v_types,
          ascent_types  = case when v_types @> ascent_types and v_types @> descent_types
                                and v_types <@ (ascent_types || descent_types) then ascent_types end,
          descent_types = case when v_types @> ascent_types and v_types @> descent_types
                                and v_types <@ (ascent_types || descent_types) then descent_types end
        where id = s.tour_id;
      end if;
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
    when 'grade' then
      update public.tours set grade = nullif(btrim(s.value #>> '{}'), '') where id = s.tour_id;
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
