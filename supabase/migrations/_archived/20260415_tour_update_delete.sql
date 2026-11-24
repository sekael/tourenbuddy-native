-- Migration: Add update_tour_full RPC and verify tour_partners cascade (Issue #66)

-- 1. Ensure tour_partners FK cascades on tour delete.
--    Recreate the constraint if it doesn't already have ON DELETE CASCADE.
do $$
begin
  -- Drop the existing FK if it lacks cascade, then recreate it.
  -- Harmless if it already has cascade — constraint name stays the same.
  if exists (
    select 1
    from information_schema.referential_constraints rc
    join information_schema.table_constraints tc
      on rc.constraint_name = tc.constraint_name
    where tc.table_name = 'tour_partners'
      and rc.constraint_name like '%tour_id%'
      and rc.delete_rule <> 'CASCADE'
  ) then
    alter table public.tour_partners
      drop constraint if exists tour_partners_tour_id_fkey;

    alter table public.tour_partners
      add constraint tour_partners_tour_id_fkey
      foreign key (tour_id) references public.tours(id) on delete cascade;
  end if;
end;
$$;

-- 2. Create update_tour_full RPC.
--    Updates the tours row and replaces tour_partners atomically.
--    Security definer + auth.uid() check enforces RLS ownership.
create or replace function public.update_tour_full(
  p_id uuid,
  p_planned_date date default null,
  p_name text default null,
  p_goal text default null,         -- WKT e.g. 'POINT(8.5 47.0)'
  p_partner_ids uuid[] default '{}',
  p_tour_type text default null,
  p_elevation numeric default null,
  p_gpx_track jsonb default null,
  p_description text default null,
  p_seasons text[] default null,
  p_start_point text default null,  -- WKT e.g. 'POINT(8.5 47.0)'
  p_end_point text default null,    -- WKT e.g. 'POINT(8.5 47.0)'
  p_equipment text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
as $$
begin
  -- Verify the tour belongs to the calling user.
  if not exists (
    select 1 from public.tours where id = p_id and user_id = auth.uid()
  ) then
    raise exception 'Tour not found or access denied';
  end if;

  update public.tours set
    planned_date = p_planned_date,
    name         = p_name,
    goal         = p_goal::geography,
    tour_type    = p_tour_type,
    elevation    = p_elevation,
    gpx_track    = p_gpx_track,
    description  = p_description,
    seasons      = p_seasons,
    start_point  = case when p_start_point is not null then p_start_point::geography else null end,
    end_point    = case when p_end_point   is not null then p_end_point::geography   else null end,
    equipment    = p_equipment,
    notes        = p_notes
  where id = p_id;

  -- Replace partner associations atomically.
  delete from public.tour_partners where tour_id = p_id;

  if p_partner_ids is not null and array_length(p_partner_ids, 1) > 0 then
    insert into public.tour_partners (tour_id, contact_id)
    select p_id, unnest(p_partner_ids);
  end if;
end;
$$;
