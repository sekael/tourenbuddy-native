-- #287 Calendar availability sync — feeds + per-user settings.
--
-- Lands BEFORE calendar_availability_source: the replaced apply_availability_diff
-- there queries user_calendar_feeds to decide tombstone vs plain delete.

-- ---------------------------------------------------------------------------
-- 1. user_calendar_feeds — secret ICS URLs (bearer credentials, owner-only)
-- ---------------------------------------------------------------------------
create table public.user_calendar_feeds (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  -- The client normalizes webcal:// → https://; this is the trust-boundary backstop.
  url            text not null check (url like 'https://%'),
  label          text,
  etag           text,
  last_modified  text,
  last_synced_at timestamptz,
  last_error     text,
  created_at     timestamptz not null default now(),
  unique (user_id, url)
);

grant all on table public.user_calendar_feeds to anon, authenticated, service_role;

-- Owner-only: the URL grants read access to the user's calendar, so no friend policy.
-- The Worker reads/writes sync state with the service role (bypasses RLS).
alter table public.user_calendar_feeds enable row level security;

create policy "user_calendar_feeds_select_own"
  on public.user_calendar_feeds for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_calendar_feeds_insert_own"
  on public.user_calendar_feeds for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_calendar_feeds_update_own"
  on public.user_calendar_feeds for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_calendar_feeds_delete_own"
  on public.user_calendar_feeds for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Cap at 5 feeds per user — cron cost is linear in feeds.
--    Named exception prefix so the client maps it to a localized message
--    (pattern: check_tour_attachment_limit).
-- ---------------------------------------------------------------------------
create function public.check_calendar_feed_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- No parent row to lock (auth.users is not ours) — a per-user advisory lock
  -- serializes concurrent inserts so two parallel adds can't both see 4.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  if (select count(*) from public.user_calendar_feeds where user_id = new.user_id) >= 5 then
    raise exception 'calendar_feed_limit_exceeded: a user may connect at most 5 calendar feeds';
  end if;
  return new;
end;
$$;

create trigger user_calendar_feeds_cap_check
  before insert on public.user_calendar_feeds
  for each row execute function public.check_calendar_feed_limit();

-- ---------------------------------------------------------------------------
-- 3. user_calendar_settings — busy-rule window + outbound feed token.
--    feed_token lives here, NOT on user_profile: that table is friend-readable
--    and the token is a bearer credential.
-- ---------------------------------------------------------------------------
create table public.user_calendar_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  core_start       time not null default '06:00',
  core_end         time not null default '18:00',
  min_free_minutes int  not null default 360,
  feed_token       uuid not null default gen_random_uuid() unique,
  created_at       timestamptz not null default now(),
  check (core_end > core_start),
  -- An unsatisfiable window would silently mark every day busy — reject at write time.
  check (min_free_minutes > 0
         and min_free_minutes <= extract(epoch from (core_end - core_start)) / 60)
);

grant all on table public.user_calendar_settings to anon, authenticated, service_role;

alter table public.user_calendar_settings enable row level security;

create policy "user_calendar_settings_select_own"
  on public.user_calendar_settings for select
  to authenticated
  using (user_id = auth.uid());

create policy "user_calendar_settings_insert_own"
  on public.user_calendar_settings for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_calendar_settings_update_own"
  on public.user_calendar_settings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
