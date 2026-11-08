select tablename from pg_publication_tables where pubname = 'supabase_realtime';
select relname, relreplident from pg_class where relname in ('tours', 'tour_attachments', 'tour_partners');