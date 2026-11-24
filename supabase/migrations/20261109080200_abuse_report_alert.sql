-- Abuse report alert (#369 B6, change: add-native-backend, design D6).
--
-- Every new or repeated report goes to the Worker, which emails the moderation address. Same
-- transport as notifications (`fn_dispatch_notification`): pg_net after commit, the Vault URL and
-- shared secret, skipped when Vault is unset (local stacks), and it never aborts the report.

create function public.fn_dispatch_abuse_report()
returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'notify_hook_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'notify_webhook_secret';

  if coalesce(v_url, '') !~ '^https?://' or coalesce(v_secret, '') = '' then
    return null;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/moderation/report',
    body := jsonb_build_object(
      'id', new.id,
      'reporter_user_id', new.reporter_user_id,
      'reported_user_id', new.reported_user_id,
      'reason', new.reason,
      'created_at', new.created_at
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notify-secret', v_secret
    )
  );
  return null;
exception when others then
  raise warning 'fn_dispatch_abuse_report failed for %: %', new.id, sqlerrm;
  return null;
end;
$$;

revoke execute on function public.fn_dispatch_abuse_report() from public, anon, authenticated;

create trigger trg_dispatch_abuse_report
  after insert or update of reason, created_at on public.abuse_reports
  for each row execute function public.fn_dispatch_abuse_report();
