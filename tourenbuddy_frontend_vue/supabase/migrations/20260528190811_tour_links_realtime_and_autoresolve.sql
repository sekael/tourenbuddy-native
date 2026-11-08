-- Realtime sub for membership changes + auto-resolve redundant pending requests.
--
-- Why:
--   1. The store currently only subscribes to tour_link_request, so accept
--      semantics on one client never push the resulting tour_link_member INSERT
--      to the other party until a page reload re-runs fetchAll. Add the
--      member table to the supabase_realtime publication so the store's
--      second binding (added in this change) can listen.
--   2. When user A sends link requests to both B and C, and B/C are already
--      in a group together, accepting on B drops A into that group via the
--      accept RPC. The pending request to C remains pending even though A
--      and C are now linked through the same group — clicking it would be
--      a no-op. Auto-resolve those requests as 'accepted' so the UI clears
--      without a redundant second handshake.

alter publication supabase_realtime add table public.tour_link_member;

create or replace function public.fn_autoresolve_pending_on_member_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Any pending request touching the newly-inserted tour whose other end is
  -- now in the same group is redundant — mark it accepted so the UI on both
  -- sides drops the banner. No tour_link_member rows are written here; the
  -- two tours are already members of new.group_id.
  update public.tour_link_request r
     set status = 'accepted',
         resolved_at = now()
   where r.status = 'pending'
     and (r.initiator_tour_id = new.tour_id or r.target_tour_id = new.tour_id)
     and exists (
       select 1
         from public.tour_link_member m_init
         join public.tour_link_member m_targ
           on m_init.group_id = m_targ.group_id
        where m_init.tour_id = r.initiator_tour_id
          and m_targ.tour_id = r.target_tour_id
     );
  return new;
end;
$$;

drop trigger if exists trg_autoresolve_pending_on_member_insert on public.tour_link_member;
create trigger trg_autoresolve_pending_on_member_insert
  after insert on public.tour_link_member
  for each row execute function public.fn_autoresolve_pending_on_member_insert();
