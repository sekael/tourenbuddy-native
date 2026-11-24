-- Per-device Web Push (issue #148, change: notification-inbox, design D6).
--
-- push_subscriptions was always multi-device server-side (unique per endpoint, the Worker
-- fans out to every row of a user). Two things broke it: the client (fixed in app code)
-- and RLS — a browser endpoint still owned by account A cannot be upserted by account B
-- on a shared browser, so B silently gets no push. This RPC reassigns it.

create function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- One endpoint = one browser profile, so whoever registers it last owns it: the
  -- previous account signed out (or never removed it) on this browser.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update set
    user_id    = excluded.user_id,
    p256dh     = excluded.p256dh,
    auth       = excluded.auth,
    user_agent   = excluded.user_agent,
    last_seen_at = now();
end;
$$;

revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- "Rows exist = push enabled" from day one: the Worker stops reading notif_push_enabled
-- (deprecated, dropped in a later change), so a row left behind by a user who had push
-- OFF would otherwise start pushing. Expected to delete nothing — defensive.
delete from public.push_subscriptions ps
 using public.user_profile up
 where up.id = ps.user_id and up.notif_push_enabled = false;
