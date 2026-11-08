-- #244 Friends' availability: read access + realtime, additive to #242's owner-only
-- user_availability. No schema change.
--
-- Two-layer authz mirrors friend-tours (#198):
--   Layer 1 (row visibility): additive friend-SELECT RLS makes a friend's rows readable.
--   Layer 2 (live signal): a SECURITY DEFINER broadcast trigger only pings "refetch" to
--     each friend's private topic; the actual rows are still fetched under Layer-1 RLS.

-- ---------------------------------------------------------------------------
-- Layer 1: friend SELECT policy (additive — ORs with user_availability_select_own)
-- ---------------------------------------------------------------------------
create policy "user_availability_select_friend"
  on public.user_availability for select
  to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where (f.request_user_id = auth.uid() and f.response_user_id = user_availability.user_id)
         or (f.request_user_id = user_availability.user_id and f.response_user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- Own multi-device sync: postgres_changes only streams tables in this publication.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.user_availability;

-- ---------------------------------------------------------------------------
-- Broadcast trigger: ping each changed user's accepted friends to refetch.
--
-- STATEMENT-level (not per-row): a save is a multi-day diff — one RPC writes many
--   rows. FOR EACH STATEMENT emits once per insert/delete statement (<=2 per save)
--   regardless of row count.
-- Transition tables (not auth.uid()): the changed user comes from the ROWS, not the
--   caller. apply_availability_diff runs insert + delete as two statements, so a
--   removal-only save still executes a 0-row insert statement — reading the changed
--   user from `changed` self-guards (no rows -> no friends -> no send) instead of
--   firing a spurious broadcast. Also keeps the trigger correct for any write path.
-- realtime.send signature (jsonb overload): (payload jsonb, event, topic, private).
-- ---------------------------------------------------------------------------
create or replace function public.fn_broadcast_availability_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _friend record;
begin
  for _friend in
    select distinct
      case
        when f.request_user_id = c.user_id then f.response_user_id
        else f.request_user_id
      end as friend_id
    from (select distinct user_id from changed) c
    join public.friendships f
      on f.request_user_id = c.user_id
      or f.response_user_id = c.user_id
  loop
    perform realtime.send(
      jsonb_build_object('op', TG_OP),
      'refetch',
      'availability:' || _friend.friend_id::text,
      true  -- private channel
    );
  end loop;

  return null;  -- statement-level AFTER trigger: return value ignored
end;
$$;

-- One trigger per operation: a single trigger cannot reference both NEW and OLD
-- transition tables. Both name it `changed` so the function body is op-agnostic.
create trigger trg_broadcast_availability_insert
  after insert on public.user_availability
  referencing new table as changed
  for each statement execute function public.fn_broadcast_availability_change();

create trigger trg_broadcast_availability_delete
  after delete on public.user_availability
  referencing old table as changed
  for each statement execute function public.fn_broadcast_availability_change();

-- ---------------------------------------------------------------------------
-- Realtime topic authz: a user may read only their own availability:<uid> topic.
-- Broadcast bypasses table RLS, so without this any user could subscribe to any topic.
-- ---------------------------------------------------------------------------
create policy "availability_broadcast_own_topic" on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and topic like 'availability:%'
    and auth.uid()::text = split_part(topic, ':', 2)
  );
