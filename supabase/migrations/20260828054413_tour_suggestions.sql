-- Partner tour suggestions (issue #268) — see openspec/changes/tour-suggestions/.
--
-- Every write path on `tours` is owner-only by construction. This migration adds a
-- proposal channel instead of widening it: a partner records what they would change,
-- the owner adjudicates per field, and ONLY an accept touches the tour. The tour row
-- itself is never writable by a non-owner — accepts run inside SECURITY DEFINER RPCs
-- that carry their own explicit owner gate (design D5).
--
-- Layout: 1 table + grants + indexes + RLS, 2 the field serializer, 3 the read view,
-- 4 the void-on-predicate-break triggers, 5 realtime, 6 the five RPCs, 7 storage.

-- =====================================================================
-- 1. Table (design D1)
-- =====================================================================
-- One row per LOGICAL field (D2). Accept/decline is per field, so the field IS the
-- aggregate — status lives on the row and there is no second place to record it.
--
-- `value` is nullable ON PURPOSE: "remove the description" is a real suggestion. The
-- absence of a suggestion is the absence of a row, not a null value.
--
-- `owner_id` is denormalized from the tour (D8) because Realtime filters cannot join:
-- the owner cannot subscribe to "suggestions on my tours" through `tour_id`. It doubles
-- as the SELECT policy and the store's single load query. Safe because tour ownership is
-- immutable — no code path transfers a tour, and neither tour RPC updates `user_id`.

create table public.tour_suggestion (
  id            uuid primary key default gen_random_uuid(),
  tour_id       uuid not null references public.tours(id) on delete cascade,
  owner_id      uuid not null references auth.users(id) on delete cascade,
  suggester_id  uuid not null references auth.users(id) on delete cascade,
  batch_id      uuid not null,
  field         text not null check (field in (
                  'name', 'dates', 'goal', 'tour_type', 'elevation', 'description',
                  'seasons', 'equipment', 'notes', 'start_point', 'end_point', 'gpx',
                  'attachment_add', 'attachment_remove'
                )),
  value         jsonb,
  base_value    jsonb,
  target_id     uuid,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  check (suggester_id <> owner_id)
);

-- MANDATORY for every new public table: Supabase drops the implicit Data API grant on
-- 2026-10-30, and without this the table is invisible to PostgREST / supabase-js.
grant all on table public.tour_suggestion to anon, authenticated, service_role;

-- D13: at most one pending suggestion per author per field per tour. This makes D12's
-- reconcile model an invariant rather than a UI convention — it kills duplicate rows from
-- a retried submit on a flaky connection, gives the upsert its `on conflict` target, and
-- spares D7's auto-decline from reasoning about two pending rows from one author.
create unique index tour_suggestion_one_pending_per_field
  on public.tour_suggestion (
    tour_id, suggester_id, field, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'pending';

create index tour_suggestion_tour_status_idx on public.tour_suggestion (tour_id, status);
create index tour_suggestion_owner_idx on public.tour_suggestion (owner_id);
create index tour_suggestion_suggester_idx on public.tour_suggestion (suggester_id);
create index tour_suggestion_batch_idx on public.tour_suggestion (batch_id);

alter table public.tour_suggestion enable row level security;

-- The ONLY policy. Pending suggestions are visible to the owner and their author only;
-- other partners see the unmodified tour. No INSERT / UPDATE / DELETE policy exists —
-- their ABSENCE is the block, so every mutation must go through a definer RPC below.
create policy "tour_suggestion_select_own" on public.tour_suggestion
  for select to authenticated
  using (owner_id = auth.uid() or suggester_id = auth.uid());

-- =====================================================================
-- 2. tour_field_value — the ONLY place a tour field is serialized (design D4)
-- =====================================================================
-- Used to write `base_value` on submit AND to evaluate staleness in the view below, so
-- both sides of every comparison come from one expression and date / coordinate / null
-- canonicalisation cannot drift. The client never compares values itself.
--
-- Coupled columns travel together (D2): `dates` so a partial accept can never trip
-- `tours_end_date_after_start`; the points so a coordinate can never be accepted without
-- the name and elevation derived from it.
--
-- The two attachment ops have no tour-column counterpart, so they serialize to NULL and
-- are never stale — a suggested file does not go out of date when the tour is edited.

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
  where t.id = p_tour_id;
$$;

-- =====================================================================
-- 3. tour_suggestion_view — the client's only read surface
-- =====================================================================
-- security_invoker so the SELECT policy above filters rows under the caller's privileges.
-- Carries `is_stale` (D4) and the author's display name so the review sheet needs no
-- second lookup (the owner may not read a friend's user_profile directly).

create view public.tour_suggestion_view
  with (security_invoker = true) as
  select
    s.id,
    s.tour_id,
    s.owner_id,
    s.suggester_id,
    s.batch_id,
    s.field,
    s.value,
    s.base_value,
    s.target_id,
    s.status,
    s.created_at,
    s.resolved_at,
    public.tour_field_value(s.tour_id, s.field) as current_value,
    public.tour_field_value(s.tour_id, s.field) is distinct from s.base_value as is_stale,
    n.first_name as suggester_first_name,
    n.last_name as suggester_last_name
  from public.tour_suggestion s
  left join lateral public.get_user_names_by_ids(array[s.suggester_id]) n on true;

grant select on public.tour_suggestion_view to authenticated;

-- =====================================================================
-- 4. Void pending suggestions when the partner predicate breaks (design D11)
-- =====================================================================
-- Partner status is derived live, never materialized: it can evaporate between
-- suggesting and accepting (tour goes private, partner removed, friendship deleted, the
-- contact loses its phone). Without this the owner reviews proposals from someone who can
-- no longer see the tour they refer to. Voiding is SILENT — no dispatch (D16).
-- Mirrors 20260530120000_void_pending_requests_on_predicate_break.sql.

create or replace function public.fn_void_broken_tour_suggestions(p_tour_ids uuid[])
  returns void
  language sql
  security definer
  set search_path = public, extensions
as $$
  update public.tour_suggestion s
     set status = 'withdrawn', resolved_at = now()
   where s.status = 'pending'
     and s.tour_id = any(p_tour_ids)
     and not (
       exists (
         select 1 from public.tours t
         where t.id = s.tour_id and t.visibility = 'friends'
       )
       and exists (
         select 1 from public.friendships f
         where (f.request_user_id = s.owner_id and f.response_user_id = s.suggester_id)
            or (f.request_user_id = s.suggester_id and f.response_user_id = s.owner_id)
       )
       and s.suggester_id = any(public.tour_partner_user_ids(s.tour_id))
     );
$$;

create or replace function public.fn_void_tour_suggestions_on_tour_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
begin
  -- Only visibility can break the predicate from the `tours` side; the partner set lives
  -- in tour_partners and has its own trigger below.
  if new.visibility is distinct from old.visibility then
    perform public.fn_void_broken_tour_suggestions(array[new.id]);
  end if;
  return new;
end;
$$;

create or replace function public.fn_void_tour_suggestions_on_partner_change()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
begin
  perform public.fn_void_broken_tour_suggestions(array[coalesce(new.tour_id, old.tour_id)]);
  return null;
end;
$$;

create or replace function public.fn_void_tour_suggestions_on_friendship_delete()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
begin
  perform public.fn_void_broken_tour_suggestions(
    array(
      select t.id from public.tours t
      where t.user_id in (old.request_user_id, old.response_user_id)
    )
  );
  return null;
end;
$$;

create or replace function public.fn_void_tour_suggestions_on_contact_method_delete()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
begin
  -- A deleted phone breaks tour_partner_user_ids for every tour of the contact's owner.
  perform public.fn_void_broken_tour_suggestions(
    array(
      select t.id
      from public.tours t
      join public.contacts c on c.user_id = t.user_id
      where c.id = old.contact_id
    )
  );
  return null;
end;
$$;

drop trigger if exists trg_void_tour_suggestions_on_tour_change on public.tours;
create trigger trg_void_tour_suggestions_on_tour_change
  after update on public.tours
  for each row execute function public.fn_void_tour_suggestions_on_tour_change();

drop trigger if exists trg_void_tour_suggestions_on_partner_change on public.tour_partners;
create trigger trg_void_tour_suggestions_on_partner_change
  after insert or delete on public.tour_partners
  for each row execute function public.fn_void_tour_suggestions_on_partner_change();

drop trigger if exists trg_void_tour_suggestions_on_friendship_delete on public.friendships;
create trigger trg_void_tour_suggestions_on_friendship_delete
  after delete on public.friendships
  for each row execute function public.fn_void_tour_suggestions_on_friendship_delete();

drop trigger if exists trg_void_tour_suggestions_on_contact_method_delete on public.contact_methods;
create trigger trg_void_tour_suggestions_on_contact_method_delete
  after delete on public.contact_methods
  for each row execute function public.fn_void_tour_suggestions_on_contact_method_delete();

-- =====================================================================
-- 5. Realtime
-- =====================================================================
-- Both sides subscribe on one channel with a user-scoped filter (D8):
--   owner_id=eq.<uid>  and  suggester_id=eq.<uid>
alter publication supabase_realtime add table public.tour_suggestion;

-- =====================================================================
-- 6. RPCs
-- =====================================================================

-- ---------------------------------------------------------------------
-- Shared guard: the caller may suggest on this tour. Raises, never returns false —
-- it is called from every mutating RPC and the error names the reason.
-- ---------------------------------------------------------------------
create or replace function public.fn_assert_can_suggest(p_tour_id uuid)
  returns uuid
  language plpgsql
  stable
  security definer
  set search_path = public, extensions
as $$
declare
  v_owner uuid;
  v_visibility text;
begin
  select t.user_id, t.visibility into v_owner, v_visibility
  from public.tours t where t.id = p_tour_id;

  if v_owner is null then
    raise exception 'tour_suggestion.tour_not_found' using errcode = 'P0001';
  end if;

  if v_owner = auth.uid() then
    raise exception 'tour_suggestion.owner_cannot_suggest' using errcode = 'P0001';
  end if;

  if v_visibility <> 'friends' then
    raise exception 'tour_suggestion.tour_not_shared' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.friendships f
    where (f.request_user_id = auth.uid() and f.response_user_id = v_owner)
       or (f.request_user_id = v_owner and f.response_user_id = auth.uid())
  ) then
    raise exception 'tour_suggestion.not_friend' using errcode = '42501';
  end if;

  if not (auth.uid() = any(public.tour_partner_user_ids(p_tour_id))) then
    raise exception 'tour_suggestion.not_partner' using errcode = '42501';
  end if;

  return v_owner;
end;
$$;

-- ---------------------------------------------------------------------
-- Completion check (D16): of the given batches, which now hold no pending row.
-- The author is notified ONCE, on the transition to fully resolved — a partially
-- resolved batch stays silent because the owner has not finished deciding.
-- ---------------------------------------------------------------------
create or replace function public.fn_resolved_batches(p_batch_ids uuid[])
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(array_agg(distinct b), '{}'::uuid[])
  from unnest(coalesce(p_batch_ids, '{}'::uuid[])) as b
  where not exists (
    select 1 from public.tour_suggestion s
    where s.batch_id = b and s.status = 'pending'
  );
$$;

-- ---------------------------------------------------------------------
-- upsert_tour_suggestions — create AND revise, one idempotent reconciling call (D12).
--
-- This is the `update_contact_full` aggregate pattern (20260811100000): the author
-- submits the whole desired set and the server reconciles their PENDING rows against it.
-- Resolved rows are immutable; a further change means a new batch.
--
-- `base_value` ALWAYS comes from tour_field_value server-side — a client-supplied base
-- would let a suggester forge "nothing changed" and defeat the staleness signal.
--
-- p_items: [{ "field": "name", "value": <jsonb|null>, "targetId": "<uuid>|null" }, ...]
-- ---------------------------------------------------------------------
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
begin
  v_owner := public.fn_assert_can_suggest(p_tour_id);

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'tour_suggestion.invalid_items' using errcode = 'P0001';
  end if;

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

  return jsonb_build_object('batch_id', p_batch_id, 'pending_count', v_pending);
end;
$$;

-- ---------------------------------------------------------------------
-- fn_apply_tour_suggestion — the targeted UPDATE behind an accept (design D5).
--
-- `updated_at` is stamped by the set_updated_at BEFORE trigger and the friend-tour
-- broadcast fires from its own AFTER trigger, both on ANY update to `tours` — so neither
-- depends on update_tour_full, which is a full-row overwrite that would null every
-- omitted column and churn tour_partners on each accept.
--
-- p_storage_path: the OWNER's copy of a staged blob (D9). The owner's client issues
-- storage.copy() before calling, so the accepted row never points into the suggester's
-- prefix — where the owner's read grant expires with the suggestion.
--
-- Returns the storage path the caller should now delete (attachment_remove), or null.
-- Private: no execute grant, called only from the two accept RPCs below.
-- ---------------------------------------------------------------------
create or replace function public.fn_apply_tour_suggestion(p_id uuid, p_storage_path text)
  returns text
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
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
      update public.tours set tour_type = s.value #>> '{}' where id = s.tour_id;
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
$$;

-- ---------------------------------------------------------------------
-- accept_tour_suggestion — owner-only, one field.
--
-- SECURITY DEFINER bypasses RLS, so the explicit owner gate below is the ONLY gate —
-- written as update_tour_full:127 writes it.
--
-- Accepting a field auto-declines every other pending suggestion on the same
-- (field, target_id) (D7): their base is now definitively stale, and two adds must not
-- cancel each other, which is why target_id is part of the scope.
-- ---------------------------------------------------------------------
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

  return jsonb_build_object(
    'tour_id', s.tour_id,
    'field', s.field,
    'removed_storage_path', v_removed,
    'resolved_batches', public.fn_resolved_batches(v_batches || s.batch_id)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- accept_tour_suggestion_batch — the whole review in ONE transaction (design D10).
--
-- Fixed order: removes -> scalars -> adds, so the 5-attachment cap is evaluated on the
-- END state and "swap this photo for that one" succeeds in one tap on a full tour. A
-- genuine end-state breach raises tour_attachment_limit_exceeded from the existing cap
-- trigger and rolls the whole call back — no half-applied review.
--
-- p_storage_paths maps suggestion id -> the owner's copy of a staged blob (D9). The task
-- list names a one-argument signature; the map is required for correctness, because
-- without it an accepted attachment/GPX row would point into the suggester's prefix,
-- which the owner may only read while the suggestion is pending.
-- ---------------------------------------------------------------------
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
  v_removed text;
  v_removed_paths text[] := '{}';
  v_fields text[] := '{}';
  v_batches uuid[] := '{}';
begin
  select distinct tour_id, owner_id into v_tour_id, v_owner
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

  return jsonb_build_object(
    'tour_id', v_tour_id,
    'fields', to_jsonb(v_fields),
    'removed_storage_paths', to_jsonb(v_removed_paths),
    'resolved_batches', public.fn_resolved_batches(v_batches || p_batch_id)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- decline / withdraw — neither touches the tour.
-- ---------------------------------------------------------------------
create or replace function public.decline_tour_suggestion(p_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  s public.tour_suggestion;
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

  return jsonb_build_object(
    'resolved_batches', public.fn_resolved_batches(array[s.batch_id])
  );
end;
$$;

create or replace function public.withdraw_tour_suggestion(p_id uuid)
  returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  s public.tour_suggestion;
begin
  select * into s from public.tour_suggestion where id = p_id;

  if s.id is null then
    raise exception 'tour_suggestion.not_found' using errcode = 'P0001';
  end if;
  if s.suggester_id <> auth.uid() then
    raise exception 'tour_suggestion.not_author' using errcode = '42501';
  end if;
  if s.status <> 'pending' then
    raise exception 'tour_suggestion.already_resolved' using errcode = 'P0001';
  end if;

  update public.tour_suggestion
     set status = 'withdrawn', resolved_at = now()
   where id = p_id;

  -- Withdraw notifies nobody (D16). The staged object is swept by the author's own store
  -- on next load — only they hold delete rights on their prefix (D9).
  return jsonb_build_object('staged_path', s.value->>'storagePath');
end;
$$;

grant execute on function public.tour_field_value(uuid, text) to authenticated, service_role;
grant execute on function public.upsert_tour_suggestions(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.accept_tour_suggestion(uuid, text) to authenticated, service_role;
grant execute on function public.accept_tour_suggestion_batch(uuid, jsonb) to authenticated, service_role;
grant execute on function public.decline_tour_suggestion(uuid) to authenticated, service_role;
grant execute on function public.withdraw_tour_suggestion(uuid) to authenticated, service_role;

-- =====================================================================
-- 7. Storage (design D9)
-- =====================================================================
-- The suggester uploads to `<their uid>/suggestions/<tour_id>/<uuid>`. The first path
-- segment is their OWN uid, so the existing owner-insert policy already permits the write
-- and no isolation is weakened — there is deliberately NO new INSERT policy here.
--
-- The only new grant is this narrow read: the tour owner may read an object referenced by
-- a PENDING suggestion on their own tour, so the review sheet can render the proposed
-- file. The grant expires with the suggestion, which is why accept copies the bytes into
-- the owner's own prefix.

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
    )
  );

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
    )
  );
