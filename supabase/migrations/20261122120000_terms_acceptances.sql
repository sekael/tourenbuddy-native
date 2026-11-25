-- Terms of use acceptance (change: add-terms-acceptance; legal review 2026-11-22).
--
-- A user accepts the version of the terms in force before using the apps. The record proves it:
-- who (id and the account's email), which version, the server's time. It outlives the account by
-- 10 years from the deletion. With enforcement on, a client write needs the current acceptance.
-- Enforcement ships OFF (`terms_enforced()`); a later migration turns it on once every client on
-- this backend shows the acceptance page (design, Rollout).

-- ---------------------------------------------------------------------------------------------
-- Record
-- ---------------------------------------------------------------------------------------------

-- No foreign key to auth.users: the rows outlive the account (D3).
create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text,
  version text not null,
  accepted_at timestamptz not null default now(),
  retain_until timestamptz
);

create index terms_acceptances_user_version on public.terms_acceptances (user_id, version);

alter table public.terms_acceptances enable row level security;

-- Clients read their own records; they never write them (no policy, no privilege): the RPC does.
revoke all on table public.terms_acceptances from anon, authenticated;
grant select on table public.terms_acceptances to authenticated;
grant all on table public.terms_acceptances to service_role;

create policy terms_acceptances_select_own on public.terms_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));

-- The version in force. A terms change replaces this function in a new migration.
create function public.terms_current_version()
returns text
  language sql
  stable
  set search_path = ''
as $$ select '2026-11-22' $$;

grant execute on function public.terms_current_version() to authenticated;

-- The enforcement switch (D2). Off until every client carries the acceptance page.
create function public.terms_enforced()
returns boolean
  language sql
  stable
  set search_path = ''
as $$ select false $$;

create function public.terms_status()
returns table (current_version text, accepted_version text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select public.terms_current_version(),
         (select a.version
            from public.terms_acceptances a
           where a.user_id = auth.uid()
           order by a.accepted_at desc
           limit 1)
   where auth.uid() is not null;
$$;

grant execute on function public.terms_status() to authenticated;

create function public.accept_terms(p_version text)
returns table (current_version text, accepted_version text)
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  -- Only the version in force: an app showing another text can never record it.
  if p_version is distinct from public.terms_current_version() then
    raise exception 'terms_version_mismatch' using errcode = 'P0001';
  end if;
  insert into public.terms_acceptances (user_id, email, version)
  select v_uid, u.email, p_version
    from auth.users u
   where u.id = v_uid
     and not exists (
       select 1 from public.terms_acceptances a where a.user_id = v_uid and a.version = p_version
     );
  return query select * from public.terms_status();
end;
$$;

grant execute on function public.accept_terms(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Enforcement (D2)
-- ---------------------------------------------------------------------------------------------

-- True when the caller may write: enforcement off, no user on the request (service role, cron,
-- the auth server), or the version in force accepted. Otherwise raises `terms_not_accepted`, so
-- clients can tell this refusal from any other.
create function public.terms_ok()
returns boolean
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
begin
  if not public.terms_enforced() or auth.uid() is null then
    return true;
  end if;
  if exists (
    select 1
      from public.terms_acceptances a
     where a.user_id = auth.uid()
       and a.version = public.terms_current_version()
  ) then
    return true;
  end if;
  raise exception 'terms_not_accepted'
    using errcode = 'P0001', hint = 'Accept the current terms of use in the app.';
end;
$$;

-- Evaluated as `authenticated` in the storage policies below.
grant execute on function public.terms_ok() to authenticated;

-- Row trigger: fires for direct writes and for writes inside SECURITY DEFINER RPCs alike.
create function public.fn_require_terms()
returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  perform public.terms_ok();
  return new;
end;
$$;

-- Every base table in public but the record itself. `a_` sorts it first among BEFORE triggers.
do $$
declare
  t text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relname <> 'terms_acceptances'
  loop
    execute format(
      'create trigger a_require_terms before insert or update on public.%I '
      'for each row execute function public.fn_require_terms()',
      t
    );
  end loop;
end;
$$;

-- The two buckets' write policies, recreated with their conditions unchanged plus the check.
drop policy "tour-gpx owner insert" on storage.objects;
create policy "tour-gpx owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tour-gpx'
    and split_part(name, '/', 1) = (auth.uid())::text
    and public.terms_ok()
  );

drop policy "tour-gpx owner update" on storage.objects;
create policy "tour-gpx owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'tour-gpx' and split_part(name, '/', 1) = (auth.uid())::text)
  with check (
    bucket_id = 'tour-gpx'
    and split_part(name, '/', 1) = (auth.uid())::text
    and public.terms_ok()
  );

drop policy "tour_attachments_storage_insert_own" on storage.objects;
create policy "tour_attachments_storage_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tour-attachments'
    and split_part(name, '/', 1) = (auth.uid())::text
    and public.terms_ok()
  );

drop policy "tour_attachments_storage_update_own" on storage.objects;
create policy "tour_attachments_storage_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'tour-attachments' and split_part(name, '/', 1) = (auth.uid())::text)
  with check (
    bucket_id = 'tour-attachments'
    and split_part(name, '/', 1) = (auth.uid())::text
    and public.terms_ok()
  );

-- ---------------------------------------------------------------------------------------------
-- Retention (D3): 10 years from the account's deletion
-- ---------------------------------------------------------------------------------------------

create function public.fn_terms_acceptances_retain()
returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update public.terms_acceptances
     set retain_until = now() + interval '10 years'
   where user_id = old.id
     and retain_until is null;
  return old;
end;
$$;

revoke execute on function public.fn_terms_acceptances_retain() from public, anon, authenticated;

create trigger terms_acceptances_retain
  after delete on auth.users
  for each row execute function public.fn_terms_acceptances_retain();

-- Daily: remove expired records; mark any whose account vanished without the trigger.
create function public.fn_purge_terms_acceptances()
returns void
  language sql
  security definer
  set search_path = ''
as $$
  delete from public.terms_acceptances where retain_until < now();
  update public.terms_acceptances a
     set retain_until = now() + interval '10 years'
   where a.retain_until is null
     and not exists (select 1 from auth.users u where u.id = a.user_id);
$$;

revoke execute on function public.fn_purge_terms_acceptances() from public, anon, authenticated;

select cron.schedule(
  'terms-acceptances-retention',
  '30 3 * * *',
  $$select public.fn_purge_terms_acceptances()$$
);
