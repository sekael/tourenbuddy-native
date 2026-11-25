-- Account deletion (#369 B2, change: add-native-backend, design D5).
--
-- The Worker deletes a user's Storage objects before the auth user. Storage's list API walks one
-- folder level per call and attachments nest by tour, so the Worker asks for the names here:
-- every object in the two app buckets whose first path segment is the user (the layout every
-- storage policy already pins). The rows themselves cascade from auth.users; nothing else needed.

create function public.account_storage_objects(p_user_id uuid)
returns table (bucket_id text, name text)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select o.bucket_id, o.name
    from storage.objects o
   where o.bucket_id in ('tour-gpx', 'tour-attachments')
     and split_part(o.name, '/', 1) = p_user_id::text
   order by o.bucket_id, o.name;
$$;

-- Takes any user id and checks no caller: the Worker's service role only, never PostgREST
-- clients.
revoke execute on function public.account_storage_objects(uuid) from public, anon, authenticated;
grant execute on function public.account_storage_objects(uuid) to service_role;
