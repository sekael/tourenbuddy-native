-- Broadcast trigger: notify a tour owner's accepted friends when a friends-visible
-- tour is created, updated, or deleted, so clients can refetch friend_tours_view.
--
-- realtime.send signature (CLI 2.104):
--   realtime.send(payload bytea, event text, topic text, private boolean DEFAULT true)

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
      convert_to(
        json_build_object(
          'op', TG_OP,
          'tour_id', _tour_id,
          'owner_id', _owner_id
        )::text,
        'UTF-8'
      ),
      'refetch',
      'friend-tours:' || _friend.friend_id::text,
      true  -- private channel
    );
  end loop;

  return coalesce(new, old);
end;
$$;

create trigger trg_broadcast_friend_tour_change
  after insert or update or delete on public.tours
  for each row execute function public.fn_broadcast_friend_tour_change();
