-- =============================================================================
-- Fourth break-point: editing a phone contact_method's VALUE.
--
-- Mirrors cleanup_on_contact_method_delete, but resolves the OLD value (the
-- relationship was created against the number being replaced) and fires only
-- when the value actually changes. Also makes method_type immutable: a type
-- flip keeping the same value would break the friend link without tripping
-- the value-change guard.
-- =============================================================================

create or replace function public.cleanup_on_contact_method_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_peer  uuid;
  v_owner uuid;
begin
  select id
    into v_peer
    from auth.users
   where phone = ltrim(old.value, '+')
     and phone_confirmed_at is not null
   limit 1;

  if v_peer is null then
    return new;
  end if;

  v_owner := old.user_id;

  if v_owner is null then
    return new;
  end if;

  perform public.terminate_pending_and_friendship_between(v_owner, array[v_peer]);

  return new;
end;
$$;

create trigger trg_cleanup_on_contact_method_update
  before update on public.contact_methods
  for each row
  when (old.method_type = 'phone' and new.value is distinct from old.value)
  execute function public.cleanup_on_contact_method_update();

-- ---------------------------------------------------------------------------
-- method_type is immutable (F5)
-- ---------------------------------------------------------------------------
create or replace function public.forbid_contact_method_type_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.method_type is distinct from old.method_type then
    raise exception 'contact_methods.method_type is immutable' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger trg_forbid_contact_method_type_change
  before update on public.contact_methods
  for each row
  execute function public.forbid_contact_method_type_change();

-- ---------------------------------------------------------------------------
-- Grants (mirror existing convention)
-- ---------------------------------------------------------------------------
revoke all on function public.cleanup_on_contact_method_update() from public;
grant execute on function public.cleanup_on_contact_method_update() to authenticated, anon, service_role;

revoke all on function public.forbid_contact_method_type_change() from public;
grant execute on function public.forbid_contact_method_type_change() to authenticated, anon, service_role;
