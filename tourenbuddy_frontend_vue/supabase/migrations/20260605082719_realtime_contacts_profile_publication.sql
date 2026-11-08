-- ---------------------------------------------------------------------------
-- Add derived user_id to contact_methods and tour_partners for realtime
-- filtering; enforce ownership with composite FKs; enable REPLICA IDENTITY
-- FULL and add all four tables to the supabase_realtime publication.
-- ---------------------------------------------------------------------------

-- ── contact_methods ─────────────────────────────────────────────────────────

alter table public.contact_methods add column if not exists user_id uuid;

create or replace function public.derive_contact_method_user_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select c.user_id
  into new.user_id
  from public.contacts c
  where c.id = new.contact_id;
  return new;
end;
$$;

create trigger trg_derive_contact_method_user_id
  before insert or update on public.contact_methods
  for each row
  execute function public.derive_contact_method_user_id();

-- Backfill from parent
update public.contact_methods cm
  set user_id = c.user_id
  from public.contacts c
 where c.id = cm.contact_id;

alter table public.contact_methods alter column user_id set not null;

-- ── tour_partners ────────────────────────────────────────────────────────────

alter table public.tour_partners add column if not exists user_id uuid;

create or replace function public.derive_tour_partner_user_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select t.user_id
  into new.user_id
  from public.tours t
  where t.id = new.tour_id;
  return new;
end;
$$;

create trigger trg_derive_tour_partner_user_id
  before insert or update on public.tour_partners
  for each row
  execute function public.derive_tour_partner_user_id();

-- Backfill from parent
update public.tour_partners tp
  set user_id = t.user_id
  from public.tours t
 where t.id = tp.tour_id;

alter table public.tour_partners alter column user_id set not null;

-- ── Parent unique targets (required for composite FK referencing) ─────────────

alter table public.contacts
  add constraint contacts_id_user_id_key unique (id, user_id);

alter table public.tours
  add constraint tours_id_user_id_key unique (id, user_id);

-- ── contact_methods composite FK (replaces single contact_id FK) ─────────────
-- Collapse to ONE FK to keep the PostgREST embed unambiguous.

alter table public.contact_methods
  drop constraint if exists contact_methods_contact_id_fkey;

alter table public.contact_methods
  add constraint contact_methods_contact_id_user_id_fkey
  foreign key (contact_id, user_id)
  references public.contacts(id, user_id)
  on delete cascade;

-- ── tour_partners composite FK on tour side (contact_id FK stays) ────────────

alter table public.tour_partners
  drop constraint if exists tour_partners_tour_id_fkey;

alter table public.tour_partners
  add constraint tour_partners_tour_id_user_id_fkey
  foreign key (tour_id, user_id)
  references public.tours(id, user_id)
  on delete cascade;

-- ── REPLICA IDENTITY FULL ────────────────────────────────────────────────────
-- Required so DELETE (and UPDATE) events carry user_id for WAL filters.

alter table public.contacts         replica identity full;
alter table public.contact_methods  replica identity full;
alter table public.tour_partners    replica identity full;
alter table public.user_profile     replica identity full;

-- ── Publication ──────────────────────────────────────────────────────────────

do $$
begin
  alter publication supabase_realtime add table public.contacts;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.contact_methods;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.tour_partners;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.user_profile;
exception when duplicate_object then null;
end $$;
