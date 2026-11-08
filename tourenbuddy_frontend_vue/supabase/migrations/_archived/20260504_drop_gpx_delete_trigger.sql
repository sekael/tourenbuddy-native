-- Drop the GPX cascade-delete triggers entirely. They cannot work because
-- Supabase blocks direct DELETE on storage.objects via the protect_delete()
-- guard ("Direct deletion from storage tables is not allowed. Use the Storage
-- API instead."). Synchronous in-transaction deletion of storage objects from
-- Postgres is therefore not possible without pg_net (async, fires post-commit)
-- or the http extension (not enabled on Supabase).
--
-- Blob lifecycle is handled client-side: the tour row is mutated first; on
-- success, the obsolete blob is removed via the Storage API. If the row
-- mutation fails, the blob is preserved (transactional from the user's POV).
-- A post-mutation blob-delete failure leaves an orphan but does not corrupt
-- user-visible state.

drop trigger if exists trg_delete_tour_gpx on public.tours;
drop trigger if exists trg_delete_superseded_tour_gpx on public.tours;
drop function if exists public.delete_tour_gpx_object();
drop function if exists public.delete_superseded_tour_gpx_object();
