-- Outings made of segments (issue #338, change multi-activity-tours, design D11–D14).
--
-- An outing is a group of the owner's tours; each tour is a numbered segment. Membership,
-- the outing's name and the segment order live on the tour row (no outing table): an outing
-- exists while a tour carries its id, a friend sees its fields exactly when they see the
-- segment, and the existing tour write path — offline queue, LWW, replay — carries every
-- outing edit. Outing fields are not a meaningful change (fn_is_meaningful_tour_change lists
-- its fields explicitly), so outing edits never notify partners.
--
-- Deploy order: after 20261020071230_multi_activity_tours, before the frontend. Stale clients
-- never send `p_outing`; an update without it keeps the membership.

-- ─── 1. Columns ────────────────────────────────────────────────────────────────────────────
-- Nullable, no default: ADD COLUMN is metadata-only — no rewrite, no row triggers, so
-- `updated_at` (the LWW baseline) is untouched.
alter table public.tours
  add column outing_id uuid,
  add column outing_name text,
  add column outing_position integer,
  add constraint tours_outing_position_check check ((outing_id is null) = (outing_position is null)),
  add constraint tours_outing_name_check check (
    outing_name is null or (outing_id is not null and length(outing_name) < 100)
  );

-- ─── 2. Views ──────────────────────────────────────────────────────────────────────────────
-- Reproduced from 20261020071230 with the three outing columns appended. Both views are
-- `select *`-free, so they must be recreated to expose new columns.
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
  t.outing_position
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
  -- Not partner-gated: an outing's name and order are as public to a friend as the tour's name.
  t.outing_id,
  t.outing_name,
  t.outing_position
from public.tours t
cross join lateral (select public.is_tour_partner(t.id) as is_partner) p
where t.user_id <> auth.uid();

-- Recreated views get the schema's default ALL grant; restore read-only (security_hardening).
revoke all on public.tours_view, public.friend_tours_view from anon, authenticated;
grant select on public.tours_view, public.friend_tours_view to authenticated;

-- ─── 3. Write RPCs ─────────────────────────────────────────────────────────────────────────
-- Trailing `p_outing jsonb` (D12): null → keep (update) / standalone (create); {} →
-- standalone; {"id", "name", "position"} → that outing's segment. DROP by the 22-arg
-- signature, CREATE with the new argument, re-grant. Bodies are 20261020071230's with only
-- the outing columns added.
drop function public.create_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date, text[]
);
drop function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date, text[]
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
  p_outing jsonb default null
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
    visibility, completed, end_date, outing_id, outing_name, outing_position
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
    case when p_outing->>'id' is not null then (p_outing->>'position')::integer end
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
  p_outing jsonb default null
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
    completed             = coalesce(p_completed, completed),
    -- null = the caller predates outings (stale build, pre-#338 queued draft): keep (D12).
    outing_id             = case when p_outing is null then outing_id
                                 else (p_outing->>'id')::uuid end,
    outing_name           = case when p_outing is null then outing_name
                                 when p_outing->>'id' is not null then nullif(btrim(p_outing->>'name'), '') end,
    outing_position       = case when p_outing is null then outing_position
                                 when p_outing->>'id' is not null then (p_outing->>'position')::integer end
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
  text, integer, text, integer, text, boolean, date, text[], jsonb
) to authenticated;
grant execute on function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text, text, text,
  text, integer, text, integer, text, boolean, date, text[], jsonb
) to authenticated;
