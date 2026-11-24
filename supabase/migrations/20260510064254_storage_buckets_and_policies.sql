insert into storage.buckets (id, name, public) values
    ('tour-gpx', 'tour-gpx', false)
  on conflict (id) do nothing;

create policy "tour-gpx owner select"
    on storage.objects for select to authenticated
    using (bucket_id = 'tour-gpx' and split_part(name, '/', 1) = (auth.uid())::text);

  create policy "tour-gpx owner insert"
    on storage.objects for insert to authenticated
    with check (bucket_id = 'tour-gpx' and split_part(name, '/', 1) = (auth.uid())::text);

  create policy "tour-gpx owner update"
    on storage.objects for update to authenticated
    using (bucket_id = 'tour-gpx' and split_part(name, '/', 1) = (auth.uid())::text)
    with check (bucket_id = 'tour-gpx' and split_part(name, '/', 1) = (auth.uid())::text);

  create policy "tour-gpx owner delete"
    on storage.objects for delete to authenticated
    using (bucket_id = 'tour-gpx' and split_part(name, '/', 1) = (auth.uid())::text);
