-- =============================================================================
-- Cleanup friendships and friend_requests when a contact link breaks.
--
-- Three break-points:
--   1. contacts BEFORE DELETE      → all phones of the contact resolved to users
--   2. contact_methods BEFORE DELETE (phone) → single phone resolved to a user
--   3. delete_own_phone()          → caller cleans all their own relationships
--
-- Termination semantics (preserves audit trail):
--   friendships       → hard DELETE
--   friend_requests pending, actor = sender   → status='cancelled', responded_at=now()
--   friend_requests pending, actor = receiver → status='denied',    responded_at=now()
--   Non-pending rows: untouched
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: terminate_pending_and_friendship_between(actor, peers)
-- ---------------------------------------------------------------------------
create or replace function public.terminate_pending_and_friendship_between(
  p_actor uuid,
  p_peers uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Remove friendships in either direction
  delete from public.friendships
   where (request_user_id = p_actor and response_user_id = any(p_peers))
      or (response_user_id = p_actor and request_user_id = any(p_peers));

  -- Cancel outgoing pending requests (actor is sender)
  update public.friend_requests
     set status = 'cancelled',
         responded_at = now()
   where from_user_id = p_actor
     and to_user_id = any(p_peers)
     and status = 'pending';

  -- Deny incoming pending requests (actor is receiver)
  update public.friend_requests
     set status = 'denied',
         responded_at = now()
   where to_user_id = p_actor
     and from_user_id = any(p_peers)
     and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger function: cleanup_on_contact_delete
-- Fires BEFORE DELETE on public.contacts
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_on_contact_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phones text[];
  v_peers  uuid[];
begin
  -- Collect all phone values for the deleted contact
  select array_agg(value)
    into v_phones
    from public.contact_methods
   where contact_id = old.id
     and method_type = 'phone';

  if v_phones is null or array_length(v_phones, 1) = 0 then
    return old;
  end if;

  -- Resolve phones to registered user IDs (strip leading '+' like find_user_by_phone)
  select array_agg(u.id)
    into v_peers
    from auth.users u
   where u.phone = any(
           select ltrim(p, '+') from unnest(v_phones) as p
         )
     and u.phone_confirmed_at is not null;

  if v_peers is null or array_length(v_peers, 1) = 0 then
    return old;
  end if;

  perform public.terminate_pending_and_friendship_between(old.user_id, v_peers);

  return old;
end;
$$;

create trigger trg_cleanup_on_contact_delete
  before delete on public.contacts
  for each row
  execute function public.cleanup_on_contact_delete();

-- ---------------------------------------------------------------------------
-- Trigger function: cleanup_on_contact_method_delete
-- Fires BEFORE DELETE on public.contact_methods WHERE method_type = 'phone'
-- ---------------------------------------------------------------------------
create or replace function public.cleanup_on_contact_method_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_peer  uuid;
  v_owner uuid;
begin
  -- Resolve the phone to a registered user
  select id
    into v_peer
    from auth.users
   where phone = ltrim(old.value, '+')
     and phone_confirmed_at is not null
   limit 1;

  if v_peer is null then
    return old;
  end if;

  -- Look up the contact owner
  select user_id
    into v_owner
    from public.contacts
   where id = old.contact_id;

  if v_owner is null then
    return old;
  end if;

  perform public.terminate_pending_and_friendship_between(v_owner, array[v_peer]);

  return old;
end;
$$;

create trigger trg_cleanup_on_contact_method_delete
  before delete on public.contact_methods
  for each row
  when (old.method_type = 'phone')
  execute function public.cleanup_on_contact_method_delete();

-- ---------------------------------------------------------------------------
-- Extend delete_own_phone() to also clean up friendships + pending requests
-- ---------------------------------------------------------------------------
create or replace function public.delete_own_phone()
returns void
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

  -- Remove all friendships where caller is a party
  delete from public.friendships
   where request_user_id = v_uid
      or response_user_id = v_uid;

  -- Cancel all outgoing pending requests
  update public.friend_requests
     set status = 'cancelled',
         responded_at = now()
   where from_user_id = v_uid
     and status = 'pending';

  -- Deny all incoming pending requests
  update public.friend_requests
     set status = 'denied',
         responded_at = now()
   where to_user_id = v_uid
     and status = 'pending';

  -- Clear the phone from auth.users and remove phone identity
  update auth.users
     set phone = null,
         phone_confirmed_at = null,
         phone_change = '',
         phone_change_token = '',
         phone_change_sent_at = null
   where id = v_uid;

  delete from auth.identities
   where user_id = v_uid
     and provider = 'phone';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants (mirror existing convention)
-- ---------------------------------------------------------------------------
revoke all on function public.terminate_pending_and_friendship_between(uuid, uuid[]) from public;
grant execute on function public.terminate_pending_and_friendship_between(uuid, uuid[]) to authenticated, anon, service_role;

revoke all on function public.cleanup_on_contact_delete() from public;
grant execute on function public.cleanup_on_contact_delete() to authenticated, anon, service_role;

revoke all on function public.cleanup_on_contact_method_delete() from public;
grant execute on function public.cleanup_on_contact_method_delete() to authenticated, anon, service_role;

-- delete_own_phone() retains its existing grant
revoke all on function public.delete_own_phone() from public;
grant execute on function public.delete_own_phone() to authenticated;
