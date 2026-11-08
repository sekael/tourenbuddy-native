-- Fix forward: the installed realtime.send signature is
--   realtime.send(payload jsonb, event text, topic text, private boolean DEFAULT true)
-- not the `bytea` overload assumed in 20260608062416. Passing a bytea payload via
-- convert_to(...) resolves to a non-existent function and aborts any tours write
-- (e.g. seed.sql) with: function realtime.send(bytea, unknown, text, boolean) does not exist.
-- Replace the function to pass a jsonb payload directly.

create or replace function public.fn_broadcast_friend_tour_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _owner_id uuid;
  _tour_id  uuid;
  _friend   record;
begin
  _owner_id := coalesce(new.user_id, old.user_id);
  _tour_id := coalesce(new.id, old.id);

  if not (
    coalesce(new.visibility, '') = 'friends'
    or coalesce(old.visibility, '') = 'friends'
  ) then
    return coalesce(new, old);
  end if;

  for _friend in
    select
      case
        when request_user_id = _owner_id then response_user_id
        else request_user_id
      end as friend_id
    from public.friendships
    where request_user_id = _owner_id
      or response_user_id = _owner_id
  loop
    perform realtime.send(
      jsonb_build_object(
        'op', TG_OP,
        'tour_id', _tour_id,
        'owner_id', _owner_id
      ),
      'refetch',
      'friend-tours:' || _friend.friend_id::text,
      true  -- private channel
    );
  end loop;

  return coalesce(new, old);
end;
$$;
