-- Fix phone lookup RPCs to handle E.164 format (+41...) vs Supabase storage format (41...)
-- Supabase auth.users stores phone without leading '+'; callers pass E.164 with '+'.
-- Both functions now strip a leading '+' from the input before comparing.
-- find_users_by_phones also returns phones in E.164 format ('+' || phone) so
-- the frontend map keys remain consistent with normalizePhone() output.

create or replace function public.find_user_by_phone(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_normalized text := ltrim(p_phone, '+');
  v_result uuid;
begin
  if not exists (
    select 1 from auth.users
    where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return null;
  end if;

  select id into v_result
  from auth.users
  where phone = v_normalized
    and phone_confirmed_at is not null
    and id <> v_caller_id
  limit 1;

  return v_result;
end;
$$;

create or replace function public.find_users_by_phones(p_phones text[])
returns table(phone text, user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_normalized text[];
begin
  if not exists (
    select 1 from auth.users
    where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return;
  end if;

  -- Strip leading '+' from each input phone before comparing
  select array_agg(ltrim(p, '+'))
  into v_normalized
  from unnest(p_phones) as p;

  return query
  select ('+' || u.phone)::text, u.id
  from auth.users u
  where u.phone = any(v_normalized)
    and u.phone_confirmed_at is not null
    and u.id <> v_caller_id;
end;
$$;
