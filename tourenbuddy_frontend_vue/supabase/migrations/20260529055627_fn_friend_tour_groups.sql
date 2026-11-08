-- Expose friend tours' group membership to the client so collision-notice can
-- pre-filter merge-forbidden candidates BEFORE the user clicks "Request to link".
--
-- Background: RLS on tour_link_member only lets a user see rows for groups
-- containing one of THEIR tours. Friend tours that sit in a separate friend-only
-- group are invisible. Without this RPC the client treats them as ungrouped
-- and surfaces `tour_link.merge_forbidden` only after the user tries to link.
--
-- The RPC returns (tour_id, group_id) for any friend tour the caller is
-- accepted-friends with. Group ids are opaque uuids — no other-user data leaks.

create or replace function public.fn_friend_tour_group_ids(p_tour_ids uuid[])
returns table(tour_id uuid, group_id uuid)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select m.tour_id, m.group_id
  from public.tour_link_member m
  join public.tours t on t.id = m.tour_id
  where m.tour_id = any(p_tour_ids)
    and (
      t.user_id = auth.uid()
      or exists (
        select 1
        from public.friendships f
        where (f.request_user_id = auth.uid() and f.response_user_id = t.user_id)
           or (f.response_user_id = auth.uid() and f.request_user_id = t.user_id)
      )
    );
$$;

grant execute on function public.fn_friend_tour_group_ids(uuid[]) to authenticated;
