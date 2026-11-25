-- Inbox entries follow tour visibility (change: notification-inbox, follow-up).
--
-- Until now an entry about a tour the recipient can no longer open stayed in the inbox and
-- reappeared, history and all, if the tour became visible again. Instead: when a user
-- loses access to a tour, the entries they hold about it are DELETED; if access returns,
-- the inbox starts over from the next event — on a re-share, `created` ("shared with you").
--
-- Access is lost when (the client's openable rule, use-inbox-navigation):
--   - they are removed as partner          → fn_notify_tour_write (sees the partner diff)
--   - the tour goes private                 → fn_notify_tour_write (every non-owner)
--   - the tour is deleted                   → fn_notify_tour_deleted (all, but `deleted` kept)
--   - the friendship ends                   → trg_clear_notifications_on_unfriend (both sides)
-- update_tour_full is the only writer of tours.visibility / tour_partners (direct writes
-- were revoked in 20261008073323), so its one emission call covers both tour paths.
--
-- Functions re-created below are verbatim from 20261008073324_notification_emission.sql
-- plus the cleanup calls; `create or replace`, same signatures, so grants and the
-- trg_notify_tour_deleted trigger stand.

-- What `p_only` (null = everyone) except `p_except` holds about a tour. A collision entry
-- names the other user's tour in tour_id and the recipient's own in ref.other_tour_id;
-- either side going away voids it. The `deleted` notice is the message about a gone tour,
-- so it stays.
create function public.fn_clear_tour_notifications(
  p_tour_id uuid,
  p_only uuid[],
  p_except uuid
) returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from public.notifications n
  where (n.tour_id = p_tour_id or n.ref->>'other_tour_id' = p_tour_id::text)
    and n.action <> 'deleted'
    and (p_only is null or n.recipient_id = any(p_only))
    and n.recipient_id is distinct from p_except;
$$;

revoke execute on function public.fn_clear_tour_notifications(uuid, uuid[], uuid)
  from public, anon, authenticated;

create or replace function public.fn_notify_tour_write(
  p_tour_id uuid,
  p_old public.tours,
  p_old_partners uuid[]
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_new public.tours;
  v_now_partners uuid[];
  v_recipients uuid[];
  v_added uuid[];
  v_meaningful boolean;
  r record;
begin
  select * into v_new from public.tours where id = p_tour_id;
  if not found then
    return;
  end if;
  if v_new.visibility <> 'friends' then
    -- Gone private: every friend loses sight of it, so nothing they hold about it stays.
    if p_old.visibility = 'friends' then
      perform public.fn_clear_tour_notifications(p_tour_id, null, v_new.user_id);
    end if;
    return;
  end if;

  v_now_partners := public.tour_partner_user_ids(p_tour_id);
  v_recipients := public.fn_friend_partner_ids(p_tour_id, v_new.user_id);

  -- A create, or a re-share after being private: the partners' history was cleared when
  -- it went private, so they start over with `created` ("shared with you").
  if p_old.id is null or p_old.visibility is distinct from 'friends' then
    v_meaningful := true;
    v_added := v_recipients;
  else
    -- Removed partners can no longer open the tour: drop what they were told about it.
    perform public.fn_clear_tour_notifications(
      p_tour_id, array(select unnest(p_old_partners) except select unnest(v_now_partners)), null
    );
    v_meaningful := public.fn_is_meaningful_tour_change(
      p_old, v_new,
      not (v_now_partners @> p_old_partners and p_old_partners @> v_now_partners)
    );
    v_added := array(select unnest(v_recipients) except select unnest(p_old_partners));
  end if;

  if v_meaningful or p_old.completed is distinct from v_new.completed then
    perform public.fn_emit_notification(v_added, 'tour_updates', 'created', p_tour_id, v_new.name);
    perform public.fn_emit_notification(
      array(select unnest(v_recipients) except select unnest(v_added)),
      'tour_updates', 'updated', p_tour_id, v_new.name
    );
  end if;

  if v_meaningful then
    for r in select * from public.fn_scan_collisions_for_tour(p_tour_id) loop
      perform public.fn_emit_notification(
        array[r.other_user_id], 'tour_interest', 'collision', p_tour_id, v_new.name,
        jsonb_build_object('other_tour_id', r.other_tour_id)
      );
    end loop;
  end if;
exception when others then
  raise warning 'fn_notify_tour_write failed for %: %', p_tour_id, sqlerrm;
end;
$$;

create or replace function public.fn_notify_tour_deleted()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- Before the auth gate: a cascade delete (account removal) hides the tour just the same.
  -- Runs before the `deleted` notice is emitted, and keeps any earlier one.
  perform public.fn_clear_tour_notifications(old.id, null, null);

  if auth.uid() is distinct from old.user_id then
    return old;
  end if;

  begin
    if old.visibility = 'friends' then
      perform public.fn_emit_notification(
        public.fn_friend_partner_ids(old.id, old.user_id),
        'tour_updates', 'deleted', old.id, old.name
      );
    end if;
    perform public.fn_emit_group_removal(
      (select group_id from public.tour_link_member where tour_id = old.id),
      array[old.id]
    );
  exception when others then
    raise warning 'fn_notify_tour_deleted failed for %: %', old.id, sqlerrm;
  end;
  return old;
end;
$$;

-- Unfriend: each side loses sight of the other's friends-visible tours. Entries about
-- their OWN tours (a suggestion or link from the ex-friend) stay — those tours are still
-- theirs to open. Exception-guarded: cleanup never blocks removing a friendship.
create function public.fn_clear_notifications_on_unfriend()
  returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from public.notifications n
  using public.tours t
  where t.id = n.tour_id
    and n.action <> 'deleted'
    and (
      (n.recipient_id = old.request_user_id and t.user_id = old.response_user_id)
      or (n.recipient_id = old.response_user_id and t.user_id = old.request_user_id)
    );
  return old;
exception when others then
  raise warning 'fn_clear_notifications_on_unfriend failed: %', sqlerrm;
  return old;
end;
$$;

revoke execute on function public.fn_clear_notifications_on_unfriend() from public, anon, authenticated;

create trigger trg_clear_notifications_on_unfriend
  after delete on public.friendships
  for each row execute function public.fn_clear_notifications_on_unfriend();
