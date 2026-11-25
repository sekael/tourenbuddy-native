-- Native push (#369 B1, change: add-native-backend, design D2/D3).
--
-- One row per OS push token of the native apps: an APNs token (iOS, sent to directly by the
-- Worker) or an FCM registration token (Android). Kept apart from the PWA's Web Push
-- `push_subscriptions`, which B9 drops after cutover. Rows exist = push on for that device.

create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  token text not null unique check (length(token) between 1 and 4096),
  -- The bundle id / package: the APNs topic, and which app variant the token belongs to.
  app_id text not null check (app_id in ('ch.tourenbuddy.app', 'ch.tourenbuddy.app.dev')),
  -- From the provisioning profile's aps-environment (design D3); picks the APNs host.
  apns_environment text check (apns_environment in ('development', 'production')),
  app_version text check (length(app_version) <= 64),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint device_push_tokens_ios_environment
    check (platform <> 'ios' or apns_environment is not null)
);

create index device_push_tokens_user_id_idx on public.device_push_tokens (user_id);

alter table public.device_push_tokens enable row level security;

-- Own rows only. Sign-out deletes its device's row directly; writes go through the RPC.
create policy device_push_tokens_select_own on public.device_push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy device_push_tokens_delete_own on public.device_push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.device_push_tokens from anon, authenticated;
grant select, delete on table public.device_push_tokens to authenticated;
grant all on table public.device_push_tokens to service_role;

create function public.register_device_push_token(
  p_token text,
  p_platform text,
  p_app_id text,
  p_apns_environment text default null,
  p_app_version text default null
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- The table's checks reject a bad platform, app id, length or a missing iOS environment.
  -- One token = one app install, so whoever registers it last owns it: the previous account
  -- signed out (or never removed it) on this device.
  insert into public.device_push_tokens
    (user_id, platform, token, app_id, apns_environment, app_version)
  values
    (auth.uid(), p_platform, p_token, p_app_id,
     case when p_platform = 'ios' then p_apns_environment end, p_app_version)
  on conflict (token) do update set
    user_id          = excluded.user_id,
    platform         = excluded.platform,
    app_id           = excluded.app_id,
    apns_environment = excluded.apns_environment,
    app_version      = excluded.app_version,
    last_seen_at     = now();
end;
$$;

revoke execute on function public.register_device_push_token(text, text, text, text, text) from public, anon;
grant execute on function public.register_device_push_token(text, text, text, text, text) to authenticated;
