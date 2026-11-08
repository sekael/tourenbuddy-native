-- ============================================================
-- report_user must be SECURITY DEFINER for the same reason as
-- block_user / unblock_user: abuse_reports has RLS enabled and
-- writes are RPC-only. Under SECURITY INVOKER the INSERT runs
-- as the caller and is rejected by RLS.
--
-- The RPC validates the reporter is auth.uid() by setting the
-- reporter_user_id column directly, so authorization is preserved.
-- ============================================================
create or replace function public.report_user(target uuid, reason text)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.abuse_reports (reporter_user_id, reported_user_id, reason)
  values (auth.uid(), target, reason)
  on conflict (reporter_user_id, reported_user_id) do update
    set reason     = excluded.reason,
        created_at = now();
end;
$$;

revoke all on function public.report_user(uuid, text) from public;
grant execute on function public.report_user(uuid, text) to authenticated;
