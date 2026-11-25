-- Drop the pre-offline contact-method write RPCs. Contact writes now go through the
-- aggregate `create_contact_full` / `update_contact_full` RPCs (20260811100000), which
-- reconcile the whole method set in one idempotent call. `create_contact_with_methods`
-- (server-minted id) and `set_primary_phone` (single-method toggle) are unreachable:
-- their only callers were `ContactsRepositoryImpl.createContact` / `ContactMethodsRepositoryImpl`,
-- both deleted with the online/offline path unification.
--
-- Function-only drop: no table, column, data, or grant on `contacts` / `contact_methods`
-- is touched, so no existing contact or contact_method row changes.

drop function if exists public.create_contact_with_methods(text, text, text, jsonb);
drop function if exists public.set_primary_phone(uuid, uuid);
