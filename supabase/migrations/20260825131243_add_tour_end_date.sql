-- Multi-day tours (issue #264): a tour gains an optional end date, so a hut-to-hut trip
-- or a ski traverse is one tour spanning N days instead of N fake tours.
--
-- `planned_date` keeps its meaning and becomes the SPAN START; `end_date is null` means a
-- single-day tour, so every existing read is unaffected. The CHECK is the backstop for the
-- client-side ordering validation.
--
-- No Data API grants for the table: this is ALTER TABLE, not CREATE TABLE, so the existing
-- grants stand. The function grants below ARE required — dropping a function drops its grants.

alter table public.tours add column end_date date;

alter table public.tours add constraint tours_end_date_after_start
  check (end_date is null or planned_date is null or end_date >= planned_date);

-- Adding a param changes each function's signature, so CREATE OR REPLACE cannot be used
-- (it would leave a second overload and make PostgREST's named-argument resolution
-- ambiguous). Each is DROPped by its CURRENT (20-arg) signature then re-CREATEd with the
-- new trailing arg, and the Data-API grants are re-issued for the NEW (21-arg) signatures.
-- Bodies are reproduced verbatim from the latest definition (20260811093000) with only the
-- `end_date` column threaded in. Mirrors exactly how `p_completed` was folded in there.
--
-- `default null` is what makes the deploy safe in both directions: an outbox entry queued
-- by the old client omits the argument and replays as a single-day tour, and the old
-- deployed frontend keeps working against the new DB. Ordering: migration first, frontend
-- second.

drop function public.create_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text,
  text, text, text, integer, text, integer, text, boolean
);

drop function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text,
  text, text, text, integer, text, integer, text, boolean
);

-- create_tour_full: single atomic write of tour + partners + visibility + completed +
-- gpx path, idempotent by id (safe replay of the same client-UUID create).
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
  if not found then
    return;
  end if;

  if array_length(p_partner_ids, 1) > 0 then
    insert into public.tour_partners (tour_id, contact_id)
    select p_id, unnest(p_partner_ids);
  end if;
end;
$$;

-- update_tour_full: single atomic update-only write. Returns true when a row was
-- updated, false when the tour is gone (soft — never resurrects). A row owned by a
-- different user is a hard RAISE (the SECURITY DEFINER auth gate).
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
  p_end_date date default null
) returns boolean
  language plpgsql security definer
  as $$
declare
  v_owner uuid;
begin
  -- Update-only, owner-gated (design D3). Branch instead of a single
  -- WHERE id = p_id AND user_id = auth.uid() so we can tell "gone" (soft) from
  -- "not yours" (hard) — the latter is the SECURITY DEFINER auth gate.
  select user_id into v_owner from public.tours where id = p_id;

  -- gone: soft no-op. Never insert, so a replayed update can't resurrect a deleted tour.
  if not found then
    return false;
  end if;

  -- not the owner: hard failure (SECURITY DEFINER bypasses RLS, this is the only gate).
  if v_owner <> auth.uid() then
    raise exception 'Tour not found or access denied';
  end if;

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

  return true;
end;
$$;

grant all on function public.create_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text,
  text, text, text, integer, text, integer, text, boolean, date
) to anon, authenticated, service_role;

grant all on function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text,
  text, text, text, integer, text, integer, text, boolean, date
) to anon, authenticated, service_role;

-- CREATE OR REPLACE VIEW matches columns by position and may only APPEND — so both views
-- are reproduced verbatim from their latest definitions with `end_date` as the new FINAL
-- column. The zod schemas key by name, so the position is irrelevant client-side.
--
-- tours_view: last defined in 20260811085649_add_updated_at_for_lww.sql, ending in
-- `updated_at`.
create or replace view public.tours_view as
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
   from public.tours t;

-- friend_tours_view: last defined in 20260527165812_add_unresolved_partner_count.sql,
-- ending in `unresolved_partner_count`. `end_date` is gated EXACTLY like `planned_date` —
-- anything else would let a non-partner infer the length of a tour whose start date is
-- withheld, which is the leak the Layer-2 contract exists to prevent.
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
   cross join lateral (
     select pu as partner_ids,
            auth.uid() = any(pu) as is_partner
     from public.tour_partner_user_ids(t.id) as pu
   ) p
  where t.user_id <> auth.uid();

grant select on public.friend_tours_view to authenticated;
