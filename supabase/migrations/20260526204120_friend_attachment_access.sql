-- Share tour attachments with partner-friends, mirroring the GPX access model.
--
-- Attachments (tour_attachments table + the 'tour-attachments' storage bucket) were
-- owner-only: a partner-friend who can otherwise see a friends-visible tour got zero
-- attachment rows and could not fetch the blobs. A tour fully shared with a partner
-- (friend marked as tour_partner) should expose its attachments too. Same predicate as
-- the tour-gpx partner-friend policy: friends-visible tour + accepted friendship with
-- the owner + caller resolved as a partner via tour_partner_user_ids.

-- Table: let a partner-friend SELECT the attachment metadata rows (additive; ORs with
-- tour_attachments_select_own). Write policies stay owner-only — friends read only.
create policy "tour_attachments_select_partner_friend"
  on public.tour_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.tours t
      where t.id = tour_attachments.tour_id
        and t.visibility = 'friends'
        and t.user_id <> auth.uid()
        and exists (
          select 1 from public.friendships f
          where (f.request_user_id = auth.uid() and f.response_user_id = t.user_id)
             or (f.request_user_id = t.user_id and f.response_user_id = auth.uid())
        )
        and auth.uid() = any (public.tour_partner_user_ids(t.id))
    )
  );

-- Storage: let a partner-friend SELECT the attachment objects so signed URLs resolve.
-- The bucket is otherwise owner-only (split_part(name,'/',1) = auth.uid()). Match the
-- object name to an attachment row on such a tour.
create policy "tour-attachments partner friend select"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tour-attachments'
    and exists (
      select 1
      from public.tour_attachments a
      join public.tours t on t.id = a.tour_id
      where a.storage_path = storage.objects.name
        and t.visibility = 'friends'
        and t.user_id <> auth.uid()
        and exists (
          select 1 from public.friendships f
          where (f.request_user_id = auth.uid() and f.response_user_id = t.user_id)
             or (f.request_user_id = t.user_id and f.response_user_id = auth.uid())
        )
        and auth.uid() = any (public.tour_partner_user_ids(t.id))
    )
  );
