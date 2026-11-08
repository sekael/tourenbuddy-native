-- Returns true if any verified user is registered with the given phone (E.164).
-- Callable by any authenticated user (not gated on phone verification) so that
-- users adding their first phone can be told upfront that the number is taken
-- without having to acknowledge the discoverability notice first.
-- Returns only a boolean — does not leak the owning user's UUID.
create or replace function public.is_phone_registered(p_phone text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_normalized text := ltrim(p_phone, '+');
begin
  if v_caller_id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  return exists (
    select 1
    from auth.users
    where phone = v_normalized
      and phone_confirmed_at is not null
      and id <> v_caller_id
  );
end;
$$;

revoke all on function public.is_phone_registered(text) from public;
grant execute on function public.is_phone_registered(text) to authenticated;
