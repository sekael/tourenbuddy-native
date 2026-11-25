-- Atomic, idempotent contact-aggregate write RPCs (change: offline-write-sync, task 7.2).
--
-- Contacts are an aggregate (a contact + its contact_methods). To replay a coalesced
-- offline sequence — "create contact + add 2 phones + set primary + rename" — as ONE
-- idempotent call (task 7.1's "NO multi-write replay"), the whole desired aggregate is
-- passed as the payload and reconciled server-side, exactly like the tour `*_full` RPCs
-- (20260806110942 / 20260811093000). This requires CLIENT-minted ids for the contact
-- AND every method (so the entity carries its final id offline, DC0) — hence `p_id` and
-- the `id` on each `p_methods` element, unlike the old server-id `create_contact_with_methods`.
--
-- `updated_at` (the LWW baseline, DC5) is already on both tables via 20260811085649.
-- These are NEW functions, so plain CREATE (no drop-first). SECURITY DEFINER bypasses
-- RLS, so each fully-qualifies under `search_path = ''` and owner-gates on auth.uid().

-- create_contact_full: idempotent insert of the contact (ON CONFLICT (id) DO NOTHING) +
-- full method-set reconciliation. Safe to replay the same client-UUID create.
create function public.create_contact_full(
  p_id uuid,
  p_first_name text,
  p_last_name text,
  p_display_name text,
  p_methods jsonb
) returns void
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_method jsonb;
begin
  insert into public.contacts (id, user_id, first_name, last_name, display_name)
  values (p_id, auth.uid(), p_first_name, p_last_name, p_display_name)
  on conflict (id) do nothing;

  -- Owner gate: a client-UUID collision with a foreign contact must NOT let us
  -- reconcile (write) into someone else's methods (SECURITY DEFINER bypasses RLS).
  -- On our own row (fresh insert OR idempotent replay) this passes and reconciles.
  if not exists (select 1 from public.contacts where id = p_id and user_id = auth.uid()) then
    raise exception 'Contact not found or access denied';
  end if;

  -- Replace the whole method set (idempotent by client-minted method id).
  delete from public.contact_methods cm
  where cm.contact_id = p_id
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_methods, '[]'::jsonb)) m
      where (m ->> 'id')::uuid = cm.id
    );

  -- Clear primaries first so upserting the new primary can't collide with the old one
  -- on the one_primary_phone/email partial unique indexes mid-statement.
  update public.contact_methods set is_primary = false where contact_id = p_id;

  for v_method in select * from jsonb_array_elements(coalesce(p_methods, '[]'::jsonb))
  loop
    insert into public.contact_methods (id, contact_id, method_type, value, label, is_primary)
    values (
      (v_method ->> 'id')::uuid,
      p_id,
      (v_method ->> 'method_type')::public.contact_method_type,
      v_method ->> 'value',
      v_method ->> 'label',
      coalesce((v_method ->> 'is_primary')::boolean, false)
    )
    on conflict (id) do update set
      method_type = excluded.method_type,
      value       = excluded.value,
      label       = excluded.label,
      is_primary  = excluded.is_primary;
  end loop;
end;
$$;

-- update_contact_full: update-only contact fields + method-set reconciliation. Returns
-- true when the row was updated, false when the contact is gone (soft — a replayed
-- update never resurrects a deleted contact). A foreign-owned row is a hard RAISE.
create function public.update_contact_full(
  p_id uuid,
  p_first_name text,
  p_last_name text,
  p_display_name text,
  p_methods jsonb
) returns boolean
  language plpgsql security definer
  set search_path = ''
  as $$
declare
  v_owner uuid;
  v_method jsonb;
begin
  select user_id into v_owner from public.contacts where id = p_id;

  -- gone: soft no-op. Never insert, so a replayed update can't resurrect a deleted contact.
  if not found then
    return false;
  end if;

  -- not the owner: hard failure (SECURITY DEFINER bypasses RLS, this is the only gate).
  if v_owner <> auth.uid() then
    raise exception 'Contact not found or access denied';
  end if;

  update public.contacts set
    first_name   = p_first_name,
    last_name    = p_last_name,
    display_name = p_display_name
  where id = p_id;

  -- Same whole-set reconciliation as create_contact_full.
  delete from public.contact_methods cm
  where cm.contact_id = p_id
    and not exists (
      select 1 from jsonb_array_elements(coalesce(p_methods, '[]'::jsonb)) m
      where (m ->> 'id')::uuid = cm.id
    );

  update public.contact_methods set is_primary = false where contact_id = p_id;

  for v_method in select * from jsonb_array_elements(coalesce(p_methods, '[]'::jsonb))
  loop
    insert into public.contact_methods (id, contact_id, method_type, value, label, is_primary)
    values (
      (v_method ->> 'id')::uuid,
      p_id,
      (v_method ->> 'method_type')::public.contact_method_type,
      v_method ->> 'value',
      v_method ->> 'label',
      coalesce((v_method ->> 'is_primary')::boolean, false)
    )
    on conflict (id) do update set
      method_type = excluded.method_type,
      value       = excluded.value,
      label       = excluded.label,
      is_primary  = excluded.is_primary;
  end loop;

  return true;
end;
$$;

grant all on function public.create_contact_full(uuid, text, text, text, jsonb)
  to anon, authenticated, service_role;

grant all on function public.update_contact_full(uuid, text, text, text, jsonb)
  to anon, authenticated, service_role;
