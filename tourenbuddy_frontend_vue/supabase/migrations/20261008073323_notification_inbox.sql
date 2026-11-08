-- Notification inbox (issues #300, #148) — see openspec/changes/notification-inbox/.
--
-- `public.notifications` is the single event log (design D1): every notification event is
-- a row, inserted by the database in the same transaction as the write that caused it.
-- The inbox reads it; push/email fan-out is derived from it (D4).
--
-- Layout: 1 extensions, 2 table + grants + RLS + realtime, 3 emission helper (D2),
-- 4 dispatch webhook (D4), 5 retention (D9), 6 close direct tour writes (D8).

-- =====================================================================
-- 1. Extensions
-- =====================================================================
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- =====================================================================
-- 2. Table (D1)
-- =====================================================================
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  -- Reuses the mute-type vocabulary so the Worker's mute check needs no mapping table.
  type         text not null check (type in (
                 'friend_requests', 'tour_updates', 'tour_interest', 'tour_suggestions'
               )),
  -- No check: new actions are additive and the client renders unknown ones generically.
  action       text not null,
  -- No FKs on actor_id / tour_id: an entry outlives the actor's account and the tour.
  actor_id     uuid,
  actor_name   text,
  tour_id      uuid,
  tour_name    text,
  ref          jsonb not null default '{}'::jsonb,
  occurrences  int not null default 1,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id) where read_at is null;

-- Deliberate deviation from the `grant all` template (design D1): the template exists to
-- restore Data API exposure, which `select` already does. Clients must never INSERT (a
-- forged entry) and may only touch `read_at`. The revoke first strips the project's
-- default privileges, which still grant ALL on new tables until 2026-10-30.
revoke all on table public.notifications from anon, authenticated;
grant select, delete on table public.notifications to authenticated;
grant update (read_at) on table public.notifications to authenticated;
grant all on table public.notifications to service_role;

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notifications_delete_own on public.notifications
  for delete to authenticated using (recipient_id = auth.uid());

alter publication supabase_realtime add table public.notifications;

-- =====================================================================
-- 3. Emission helper (D2)
-- =====================================================================
-- The ONE place every emission site goes through, so the three rules that must never be
-- forgotten live once:
--   a. the actor is never a recipient (and no actor => no event: service-role writes and
--      account-deletion cascades stay silent);
--   b. actor_name is snapshotted at event time;
--   c. it never raises — a notification bug must not abort the user's write.
-- Collapse: an unread entry with the same (type, action, tour_id, actor_id) for the
-- same recipient is bumped instead of duplicated, for the two noisy actions only.
--
-- `p_actor` overrides auth.uid() for the one event whose subject is not the caller: the
-- backfill digest, where the acceptor's own copy names the OTHER side as actor.
create function public.fn_emit_notification(
  p_recipients uuid[],
  p_type text,
  p_action text,
  p_tour_id uuid default null,
  p_tour_name text default null,
  p_ref jsonb default '{}'::jsonb,
  p_actor uuid default null
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_actor uuid := coalesce(p_actor, auth.uid());
  v_actor_name text;
  v_recipient uuid;
begin
  if v_actor is null then
    return;
  end if;

  select nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
    into v_actor_name
    from public.user_profile where id = v_actor;

  for v_recipient in
    select distinct r from unnest(p_recipients) as r where r is not null and r <> v_actor
  loop
    if (p_type, p_action) in (('tour_updates', 'updated'), ('tour_interest', 'collision')) then
      update public.notifications
         set occurrences = occurrences + 1,
             created_at  = now(),
             tour_name   = p_tour_name,
             actor_name  = v_actor_name
       where recipient_id = v_recipient
         and read_at is null
         and type = p_type
         and action = p_action
         and tour_id is not distinct from p_tour_id
         and actor_id = v_actor;
      if found then
        continue;
      end if;
    end if;

    insert into public.notifications
      (recipient_id, type, action, actor_id, actor_name, tour_id, tour_name, ref)
    values
      (v_recipient, p_type, p_action, v_actor, v_actor_name, p_tour_id, p_tour_name, coalesce(p_ref, '{}'::jsonb));
  end loop;
exception when others then
  -- Never abort the user's write over a notification (spec). Lands in the Postgres log.
  raise warning 'fn_emit_notification(%/%) failed: %', p_type, p_action, sqlerrm;
end;
$$;

-- Internal only: a client that could call this could forge any entry for anyone.
revoke execute on function public.fn_emit_notification(uuid[], text, text, uuid, text, jsonb, uuid)
  from public, anon, authenticated;

-- =====================================================================
-- 4. Dispatch webhook (D4)
-- =====================================================================
-- AFTER INSERT only: a collapsed repeat is an UPDATE and therefore never pushes again.
-- pg_net queues the request and sends it from a background worker AFTER commit, so a
-- rolled-back write never pushes and the user's transaction never waits on HTTP.
-- Missing Vault secrets (local without Worker, CI, preview DBs) => silent no-op; the
-- inbox row is the record either way. At-most-once, no retry (owner decision).
create function public.fn_dispatch_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_hook_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_webhook_secret';

  -- The scheme check also catches an unresolved local `env(...)` placeholder.
  if coalesce(v_url, '') !~ '^https?://' or coalesce(v_secret, '') = '' then
    return null;
  end if;

  -- The full row rides in the body (saves the Worker a lookup on the free plan); the
  -- shared secret is what makes the body trustworthy.
  perform net.http_post(
    url := rtrim(v_url, '/') || '/notify/event',
    body := to_jsonb(new),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    )
  );
  return null;
exception when others then
  raise warning 'fn_dispatch_notification failed for %: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke execute on function public.fn_dispatch_notification() from public, anon, authenticated;

create trigger trg_dispatch_notification
  after insert on public.notifications
  for each row execute function public.fn_dispatch_notification();

-- =====================================================================
-- 5. Retention (D9)
-- =====================================================================
-- pg_cron, not the Worker cron: the inbox must not depend on the Worker. A collapsed
-- entry's created_at is its LAST occurrence, so retention counts from then.
select cron.schedule(
  'purge-old-notifications',
  '30 3 * * *',
  $$delete from public.notifications where created_at < now() - interval '90 days'$$
);

-- =====================================================================
-- 6. Close direct tour writes (D8)
-- =====================================================================
-- Every create/edit must go through create_tour_full / update_tour_full, which emit.
-- Audited writers (all SECURITY DEFINER, owned by postgres, so unaffected):
-- create_tour_full, update_tour_full, fn_apply_tour_suggestion. Delete stays — the
-- BEFORE DELETE trigger emits. Only PWA bundles cached before 2026-08-06 still write
-- directly; they now fail loudly instead of bypassing emission.
revoke insert, update on table public.tours from anon, authenticated;
revoke insert, update, delete on table public.tour_partners from anon, authenticated;

drop policy if exists tours_insert_own on public.tours;
drop policy if exists tours_update_own on public.tours;
drop policy if exists tour_partners_insert_own on public.tour_partners;
drop policy if exists tour_partners_update_own on public.tour_partners;
drop policy if exists tour_partners_delete_own on public.tour_partners;
