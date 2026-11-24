-- Atomic, idempotent tour write RPCs (change: atomic-tour-write-rpcs).
-- Both functions gain a trailing `p_visibility text DEFAULT NULL` (folds the old
-- separate `patchVisibility` write into the single RPC). Adding a param changes the
-- signature and update_tour_full's return type changes void -> boolean, so
-- CREATE OR REPLACE cannot be used (it would leave a second overload / reject the
-- return-type change) — each is DROPped by its OLD signature then re-CREATEd, and the
-- Data-API grants the baseline had are re-issued for the NEW signatures. Baseline is
-- immutable; this is a new forward migration.

drop function public.create_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text,
  text, text, text, integer, text, integer
);

drop function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text,
  text, text, text, integer, text, integer
);

-- create_tour_full: single atomic write of tour + partners + visibility + gpx path,
-- idempotent by id (safe replay of the same client-UUID create).
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
  p_visibility text default null
) returns void
  language plpgsql security definer
  as $$
begin
  insert into public.tours (
    id, planned_date, name, goal, user_id, tour_type, elevation, gpx_filepath,
    description, seasons, start_point, end_point, equipment, notes,
    start_point_name, start_point_elevation, end_point_name, end_point_elevation,
    visibility
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
    coalesce(p_visibility, 'friends')
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
  p_visibility text default null
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
    -- omitted visibility (null) leaves the existing value untouched (design D1).
    visibility            = coalesce(p_visibility, visibility)
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
  text, text, text, integer, text, integer, text
) to anon, authenticated, service_role;

grant all on function public.update_tour_full(
  uuid, date, text, text, uuid[], text, numeric, text, text, text[], text, text,
  text, text, text, integer, text, integer, text
) to anon, authenticated, service_role;
