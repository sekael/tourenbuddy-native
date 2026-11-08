-- from_user_id has no default, so client inserts that omit it leave it null,
-- causing the RLS check (auth.uid() = from_user_id) to fail.
-- Set auth.uid() as the default so Postgres fills it automatically on insert.

alter table public.friend_requests
  alter column from_user_id set default auth.uid();
