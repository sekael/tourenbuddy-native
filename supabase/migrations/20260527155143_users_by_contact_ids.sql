-- Resolve a set of partner contact ids to registered user ids — the contact-rooted
-- twin of tour_partner_user_ids.
--
-- Why a second resolver: the delete-notification path can no longer read the tour
-- (it has been deleted, and tour_partners cascade-deleted with it). The Worker must
-- still resolve recipients server-side to keep authorization off the client, so it
-- re-roots the same phone→user chain on the surviving tables: the client passes the
-- partner contact ids it cached pre-delete, and this resolves them via contact_methods
-- (which outlive the tour) to confirmed-phone users. Blast radius is still bounded by
-- the caller's friendships in the Worker (recipients ∩ caller-friends − caller); this
-- function only does the phone→user hop. Normalization (ltrim '+') + confirmed-phone
-- gate mirror tour_partner_user_ids / find_users_by_phones exactly.
create or replace function public.users_by_contact_ids(p_contact_ids uuid[])
  returns uuid[]
  language sql
  stable
  security definer
  set search_path to ''
as $$
  select coalesce(array_agg(distinct u.id), '{}'::uuid[])
  from public.contact_methods cm
  join auth.users u
    on u.phone = ltrim(cm.value, '+')
    and u.phone_confirmed_at is not null
  where cm.contact_id = any(p_contact_ids)
    and cm.method_type = 'phone'::public.contact_method_type;
$$;

grant execute on function public.users_by_contact_ids(uuid[]) to authenticated;
grant execute on function public.users_by_contact_ids(uuid[]) to service_role;
