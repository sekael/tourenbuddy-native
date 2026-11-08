-- SECURITY DEFINER: remove a friendship between the caller and another user
create or replace function public.remove_friendship(p_other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := auth.uid();
  v_a uuid;
  v_b uuid;
begin
  v_a := least(v_caller_id, p_other_user_id);
  v_b := greatest(v_caller_id, p_other_user_id);

  delete from public.friendships
  where user_a_id = v_a and user_b_id = v_b;
end;
$$;
