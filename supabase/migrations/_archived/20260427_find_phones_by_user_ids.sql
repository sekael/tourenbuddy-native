-- Returns E.164 phones for given user IDs, restricted to users who share a pending
-- friend request or confirmed friendship with the caller.
-- Prevents arbitrary phone discovery: you can only resolve phones of people
-- you are already in a request/friendship relationship with.

create or replace function public.find_phones_by_user_ids(p_user_ids uuid[])
returns table(user_id uuid, phone text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
begin
  if not exists (
    select 1 from auth.users where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return;
  end if;

  return query
  select u.id, ('+' || u.phone)::text
  from auth.users u
  where u.id = any(p_user_ids)
    and u.phone_confirmed_at is not null
    and (
      exists (
        select 1 from public.friend_requests fr
        where fr.status = 'pending'
          and (
            (fr.from_user_id = v_caller_id and fr.to_user_id = u.id)
            or (fr.from_user_id = u.id and fr.to_user_id = v_caller_id)
          )
      )
      or exists (
        select 1 from public.friendships f
        where (f.user_a_id = v_caller_id and f.user_b_id = u.id)
           or (f.user_a_id = u.id and f.user_b_id = v_caller_id)
      )
    );
end;
$$;
