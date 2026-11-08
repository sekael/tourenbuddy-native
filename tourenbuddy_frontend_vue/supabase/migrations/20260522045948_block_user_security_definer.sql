-- ============================================================
-- block_user / unblock_user must be SECURITY DEFINER.
--
-- user_blocks has RLS enabled with NO insert/update policies
-- (writes go only through RPCs, per design). Under SECURITY INVOKER
-- the RPC's INSERT/UPDATE runs as the caller and is rejected by RLS.
--
-- Switch to SECURITY DEFINER so the RPC body bypasses RLS. The
-- RPCs already validate auth.uid() internally and qualify all rows
-- by auth.uid(), so authorization is still enforced.
-- ============================================================

create or replace function public.block_user(target uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if target = auth.uid() then
    raise exception 'cannot block yourself' using errcode = 'P0001';
  end if;

  if not public.is_phone_verified(auth.uid()) then
    raise exception 'phone_not_verified' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('block:' || least(auth.uid()::text, target::text)
                      || ':' || greatest(auth.uid()::text, target::text))
  );

  if exists (
    select 1 from public.user_blocks
    where blocker_user_id = auth.uid()
      and blocked_user_id = target
      and unblocked_at is null
  ) then
    raise exception 'already_blocked' using errcode = 'P0001';
  end if;

  perform public.terminate_pending_and_friendship_between(auth.uid(), array[target]);

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (auth.uid(), target)
  on conflict (blocker_user_id, blocked_user_id) do update
    set unblocked_at    = null,
        last_blocked_at = now();
end;
$$;

revoke all on function public.block_user(uuid) from public;
grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(target uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_block public.user_blocks;
  v_remaining numeric;
begin
  select * into v_block
  from public.user_blocks
  where blocker_user_id = auth.uid()
    and blocked_user_id = target
    and unblocked_at is null;

  if not found then
    raise exception 'not_blocked' using errcode = 'P0001';
  end if;

  v_remaining := extract(epoch from (v_block.last_blocked_at + interval '48 hours' - now()));
  if v_remaining > 0 then
    raise exception 'cooldown_active'
      using errcode = 'P0001',
            detail = v_remaining::text;
  end if;

  update public.user_blocks
  set unblocked_at = now()
  where blocker_user_id = auth.uid()
    and blocked_user_id = target;
end;
$$;

revoke all on function public.unblock_user(uuid) from public;
grant execute on function public.unblock_user(uuid) to authenticated;
