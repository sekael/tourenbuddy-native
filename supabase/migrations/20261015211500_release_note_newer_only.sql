-- Release notes: record only a note NEWER than the user's marker.
--
-- The marker held just the last note id and `record_release_note` recorded any different
-- id. Two builds with different current notes (prod app + a PR preview, or a device that
-- hasn't updated yet) on the same database then flipped the marker on every start, and each
-- flip re-recorded the other note: the older note came back as a new inbox entry.
--
-- Notes are now ordered by (`since`, id): a build whose note is older than or equal to the
-- marker records nothing. Equal dates still order by id, so even two notes written the same
-- day can't ping-pong.

alter table public.user_release_note_state add column last_note_since date;

-- Only two notes have ever shipped; any other id can only come from tests/local builds.
update public.user_release_note_state
set last_note_since = case last_note_id
  when '2026-10-trail-overlays' then date '2026-10-15'
  else date '2026-10-12'
end;

alter table public.user_release_note_state alter column last_note_since set not null;

-- Drop the duplicates the old comparison produced: keep each user's first entry per note.
delete from public.notifications n
using public.notifications first
where n.type = 'release_notes'
  and first.type = 'release_notes'
  and first.recipient_id = n.recipient_id
  and first.ref->>'note_id' = n.ref->>'note_id'
  and (first.created_at, first.id) < (n.created_at, n.id);

-- Same signature: `create or replace` keeps the existing EXECUTE grants (authenticated only).
create or replace function public.record_release_note(p_note_id text, p_since date)
  returns boolean
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_note_id is null or p_note_id !~ '^[a-z0-9-]{1,64}$' then
    raise exception 'invalid release note id' using errcode = '22023';
  end if;
  if p_since is null then
    raise exception 'invalid release note date' using errcode = '22023';
  end if;

  -- Accounts created after the note was written never get it.
  if (select created_at::date from auth.users where id = v_uid) > p_since then
    return false;
  end if;

  -- The conditional upsert affects no row unless this note is newer than the marker; the
  -- row lock also serializes two devices recording at once.
  insert into public.user_release_note_state as s (user_id, last_note_id, last_note_since)
  values (v_uid, p_note_id, p_since)
  on conflict (user_id) do update
    set last_note_id = excluded.last_note_id, last_note_since = excluded.last_note_since
    where (excluded.last_note_since, excluded.last_note_id) > (s.last_note_since, s.last_note_id);
  if not found then
    return false;
  end if;

  insert into public.notifications (recipient_id, type, action, ref)
  values (v_uid, 'release_notes', 'published', jsonb_build_object('note_id', p_note_id));
  return true;
end;
$$;
