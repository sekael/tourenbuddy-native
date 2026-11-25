alter table public.tours replica identity full;
alter table public.tour_attachments replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.tours;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.tour_attachments;
exception when duplicate_object then null;
end $$;
