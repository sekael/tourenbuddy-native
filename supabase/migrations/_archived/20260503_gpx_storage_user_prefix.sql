-- Migration: GPX Storage — user-prefixed paths
-- Switches bucket key from ${tourId}.gpx to ${userId}/${tourId}.gpx.
-- Enables pre-upload before tour row exists (INSERT no longer joins tours).
--
-- IMPORTANT: Before applying, manually delete any dev-only objects in the
-- tour-gpx bucket whose names do not match ${uuid}/${uuid}.gpx.
-- Production bucket is empty — no backfill required.

-- 1. Drop existing policies that depend on tour_id_from_gpx_path
drop policy if exists "tour-gpx owner select" on storage.objects;
drop policy if exists "tour-gpx owner insert" on storage.objects;
drop policy if exists "tour-gpx owner update" on storage.objects;
drop policy if exists "tour-gpx owner delete" on storage.objects;

-- 2. Drop the now-unused helper function
drop function if exists public.tour_id_from_gpx_path(text);

-- 3. INSERT — authorised by path prefix only; no join to tours
create policy "tour-gpx owner insert"
  on storage.objects
  for insert
  with check (
    bucket_id = 'tour-gpx'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. UPDATE — authorised by path prefix only; no join to tours
create policy "tour-gpx owner update"
  on storage.objects
  for update
  using (
    bucket_id = 'tour-gpx'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 5. DELETE — authorised by path prefix only; no join to tours
create policy "tour-gpx owner delete"
  on storage.objects
  for delete
  using (
    bucket_id = 'tour-gpx'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 6. SELECT — owner via tours join; defensive: string compare avoids cast errors
--    Path format: ${userId}/${tourId}.gpx — split_part(name,'/',2) extracts the
--    second segment (e.g. "tour-id.gpx"), then strip the extension.
--    Structured for extension: future shared/public clauses add OR branches here.
create policy "tour-gpx owner select"
  on storage.objects
  for select
  using (
    bucket_id = 'tour-gpx'
    and exists (
      select 1 from public.tours t
      where t.id::text = split_part(split_part(name, '/', 2), '.gpx', 1)
        and t.user_id = auth.uid()
    )
  );
