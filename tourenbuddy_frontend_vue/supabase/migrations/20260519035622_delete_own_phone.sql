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

revoke all on function public.delete_own_phone() from public;
grant execute on function public.delete_own_phone() to authenticated;
