-- =============================================================================
-- Atomic contact creation (F1): insert a contact and all its methods in one
-- transaction. A unique-violation (per-user or per-contact index) aborts the
-- whole call, so no orphan contact is left without its methods.
-- =============================================================================

create or replace function public.create_contact_with_methods(
  p_first_name text,
  p_last_name text,
  p_display_name text,
  p_methods jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact_id uuid;
  v_method jsonb;
begin
  insert into public.contacts (user_id, first_name, last_name, display_name)
  values (auth.uid(), p_first_name, p_last_name, p_display_name)
  returning id into v_contact_id;

  for v_method in select * from jsonb_array_elements(p_methods)
  loop
    insert into public.contact_methods (contact_id, method_type, value, label, is_primary)
    values (
      v_contact_id,
      (v_method ->> 'method_type')::public.contact_method_type,
      v_method ->> 'value',
      v_method ->> 'label',
      coalesce((v_method ->> 'is_primary')::boolean, false)
    );
  end loop;

  return v_contact_id;
end;
$$;

revoke all on function public.create_contact_with_methods(text, text, text, jsonb) from public;
grant execute on function public.create_contact_with_methods(text, text, text, jsonb) to authenticated;
