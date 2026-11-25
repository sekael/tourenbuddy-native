-- Inbox: weekly availability summary, tour reminders, release notes (issue #300) — see
-- openspec/changes/inbox-availability-release-notes/.
--
-- Layout: 1 type check (D5), 2 weekly availability summary (D1, D2), 3 tour reminders (D3),
-- 4 release notes (D6, D7), 5 dispatch trigger skips release notes (D8).
--
-- Both jobs insert directly instead of going through fn_emit_notification (D4): they have
-- no actor, and the helper's "no actor => silent" rule would drop them. The AFTER INSERT
-- dispatch trigger still pushes their rows.

-- =====================================================================
-- 1. Type check (D5)
-- =====================================================================
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'friend_requests', 'tour_updates', 'tour_interest', 'tour_suggestions',
  'availability', 'tour_reminders', 'release_notes'
));

-- =====================================================================
-- 2. Weekly availability summary (D1, D2)
-- =====================================================================
-- Shared-tour gate (D1): F counts for U when one of them owns a non-completed,
-- friends-visible tour the other is a partner on. fn_friend_partner_ids already resolves
-- "partners who are the owner's friends", so each such tour yields the pair both ways.
-- Window is current_date .. +6 (the job runs Monday 05:00 UTC). Never raises.
create function public.fn_weekly_availability_summary()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_week_start date := current_date;
begin
  -- Last week's summaries go, read or not: a summary is only meaningful for its week.
  delete from public.notifications
   where type = 'availability' and (ref->>'week_start')::date < v_week_start;

  with pairs as (
    select t.user_id as owner_id, p as partner_id
    from public.tours t
    cross join lateral unnest(public.fn_friend_partner_ids(t.id, t.user_id)) as p
    where not t.completed and t.visibility = 'friends'
  ),
  gated as (
    select owner_id as user_id, partner_id as friend_id from pairs
    union
    select partner_id, owner_id from pairs
  ),
  overlap as (
    select g.user_id, g.friend_id, mine.date
    from gated g
    join public.user_availability mine
      on mine.user_id = g.user_id and mine.available
    join public.user_availability theirs
      on theirs.user_id = g.friend_id and theirs.available and theirs.date = mine.date
    where mine.date between v_week_start and v_week_start + 6
  )
  insert into public.notifications (recipient_id, type, action, ref)
  select o.user_id, 'availability', 'weekly', jsonb_build_object(
           'week_start', v_week_start,
           'friend_ids', array_agg(distinct o.friend_id order by o.friend_id),
           'dates', array_agg(distinct o.date order by o.date)
         )
  from overlap o
  where not exists (
    select 1 from public.notifications n
    where n.recipient_id = o.user_id
      and n.type = 'availability'
      and n.ref->>'week_start' = v_week_start::text
  )
  group by o.user_id;
exception when others then
  raise warning 'fn_weekly_availability_summary failed: %', sqlerrm;
end;
$$;

revoke execute on function public.fn_weekly_availability_summary() from public, anon, authenticated;

-- 05:00 UTC ≈ 06:00/07:00 Zurich; DST drift accepted.
select cron.schedule(
  'weekly-availability-summary',
  '0 5 * * 1',
  $$select public.fn_weekly_availability_summary()$$
);

-- =====================================================================
-- 3. Tour reminders (D3)
-- =====================================================================
-- Exact `planned_date = current_date + 5`: stateless, so a tour planned at short notice
-- is never reminded and a date moved out to >= 5 days reminds again (new ref). The
-- `not exists` guard on (recipient, tour, planned_date) makes a re-run a no-op.
-- Partners only on friends-visible tours: private tours hide their details from them.
create function public.fn_tour_reminders()
  returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  insert into public.notifications (recipient_id, type, action, tour_id, tour_name, ref)
  select distinct r, 'tour_reminders', 'upcoming', t.id, t.name,
         jsonb_build_object('planned_date', t.planned_date)
  from public.tours t
  cross join lateral unnest(
    array[t.user_id] || case
      when t.visibility = 'friends' then public.fn_friend_partner_ids(t.id, t.user_id)
      else '{}'::uuid[]
    end
  ) as r
  where not t.completed
    and t.planned_date = current_date + 5
    and not exists (
      select 1 from public.notifications n
      where n.recipient_id = r
        and n.type = 'tour_reminders'
        and n.tour_id = t.id
        and n.ref->>'planned_date' = t.planned_date::text
    );
exception when others then
  raise warning 'fn_tour_reminders failed: %', sqlerrm;
end;
$$;

revoke execute on function public.fn_tour_reminders() from public, anon, authenticated;

select cron.schedule(
  'tour-reminders',
  '0 5 * * *',
  $$select public.fn_tour_reminders()$$
);

-- =====================================================================
-- 4. Release notes (D6, D7)
-- =====================================================================
-- Per-user marker instead of a unique index on notifications: deleting the entry or the
-- 90-day purge must not let the note come back. Separate table (not a user_profile
-- column) so recording never bumps the profile's updated_at (offline LWW) or its realtime.
create table public.user_release_note_state (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  last_note_id text not null
);

-- Deliberate deviation from the `grant all` template (as with notifications): clients
-- never touch the marker; record_release_note is the only door.
revoke all on table public.user_release_note_state from anon, authenticated;
grant all on table public.user_release_note_state to service_role;
alter table public.user_release_note_state enable row level security;

-- Records the caller's entry for the build's current note, once. Returns whether an entry
-- was created. A client can pass any id/date, but only ever affects its own inbox.
create function public.record_release_note(p_note_id text, p_since date)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_note_id is null or p_note_id !~ '^[a-z0-9-]{1,64}$' then
    raise exception 'invalid release note id' using errcode = '22023';
  end if;

  -- Accounts created after the note was written never get it.
  if (select created_at::date from auth.users where id = v_uid) > p_since then
    return false;
  end if;

  -- The conditional upsert affects no row when the marker already holds this note; the
  -- row lock also serializes two devices recording at once.
  insert into public.user_release_note_state as s (user_id, last_note_id)
  values (v_uid, p_note_id)
  on conflict (user_id) do update set last_note_id = excluded.last_note_id
    where s.last_note_id <> excluded.last_note_id;
  if not found then
    return false;
  end if;

  insert into public.notifications (recipient_id, type, action, ref)
  values (v_uid, 'release_notes', 'published', jsonb_build_object('note_id', p_note_id));
  return true;
end;
$$;

revoke execute on function public.record_release_note(text, date) from public, anon;
grant execute on function public.record_release_note(text, date) to authenticated;

-- =====================================================================
-- 5. Release notes never dispatch (D8)
-- =====================================================================
drop trigger trg_dispatch_notification on public.notifications;
create trigger trg_dispatch_notification
  after insert on public.notifications
  for each row
  when (new.type <> 'release_notes')
  execute function public.fn_dispatch_notification();
