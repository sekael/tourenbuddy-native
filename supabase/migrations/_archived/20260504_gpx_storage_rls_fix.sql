-- Migration: GPX Storage RLS fix
-- Previous user-prefix migration left INSERT denied. Rewrite policies with
-- explicit `to authenticated`, `split_part` (more robust than foldername),
-- and a `with check` clause on UPDATE for upsert paths.

drop policy if exists "tour-gpx owner select" on storage.objects;
drop policy if exists "tour-gpx owner insert" on storage.objects;
drop policy if exists "tour-gpx owner update" on storage.objects;
drop policy if exists "tour-gpx owner delete" on storage.objects;

create policy "tour-gpx owner insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'tour-gpx'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "tour-gpx owner update"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'tour-gpx'
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'tour-gpx'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "tour-gpx owner delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'tour-gpx'
    and split_part(name, '/', 1) = auth.uid()::text
  );

create policy "tour-gpx owner select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'tour-gpx'
    and split_part(name, '/', 1) = auth.uid()::text
  );
