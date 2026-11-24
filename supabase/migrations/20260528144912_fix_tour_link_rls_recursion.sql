-- Fix infinite recursion in tour_link_member / tour_link_group RLS.
-- The original policies referenced tour_link_member inside their own USING
-- clause, which re-applies the policy and recurses. Move the membership
-- lookup into a SECURITY DEFINER helper so the recursive check runs without
-- RLS, then expose only a boolean to the policy.

create or replace function public.fn_caller_owns_tour_in_group(p_group_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tour_link_member m
    join public.tours t on t.id = m.tour_id
    where m.group_id = p_group_id
      and t.user_id = auth.uid()
  );
$$;

revoke all on function public.fn_caller_owns_tour_in_group(uuid) from public;
grant execute on function public.fn_caller_owns_tour_in_group(uuid) to authenticated;

drop policy if exists "tour_link_group_select" on public.tour_link_group;
create policy "tour_link_group_select" on public.tour_link_group
  for select
  to authenticated
  using (public.fn_caller_owns_tour_in_group(id));

drop policy if exists "tour_link_member_select" on public.tour_link_member;
create policy "tour_link_member_select" on public.tour_link_member
  for select
  to authenticated
  using (public.fn_caller_owns_tour_in_group(group_id));
