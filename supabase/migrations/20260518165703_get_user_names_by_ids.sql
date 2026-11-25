CREATE OR REPLACE FUNCTION public.get_user_names_by_ids(p_user_ids uuid[])
  RETURNS TABLE (user_id uuid, first_name text, last_name text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
declare
  v_caller_id uuid := auth.uid();
begin
  if not exists (
    select 1 from auth.users
    where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return;
  end if;

  return query
  select up.id, up.first_name, up.last_name
  from public.user_profile up
  where up.id = any(p_user_ids)
    and (
      exists (
        select 1 from public.friendships f
        where (f.request_user_id = v_caller_id and f.response_user_id = up.id)
           or (f.request_user_id = up.id and f.response_user_id = v_caller_id)
      )
      or exists (
        select 1 from public.friend_requests fr
        where fr.status = 'pending'
          and fr.from_user_id = up.id
          and fr.to_user_id = v_caller_id
      )
    );
end;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_names_by_ids(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_names_by_ids(uuid[]) TO anon;
GRANT EXECUTE ON FUNCTION public.get_user_names_by_ids(uuid[]) TO service_role;
