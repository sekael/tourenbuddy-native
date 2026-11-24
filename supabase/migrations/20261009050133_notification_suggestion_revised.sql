-- Suggestion revisions notify the owner (change: notification-inbox, follow-up).
--
-- 20261008073324 kept a revision of a pending batch silent. A revision can land hours or
-- days after the first submission and changes what the owner is asked to review, so it is
-- an event in its own right: `suggestion_revised`. Submission is an explicit button press
-- (tour-info-sheet), never autosave, so this cannot spam. Not collapsed: each revision is
-- its own entry, like the submission it amends.
--
-- upsert_tour_suggestions: verbatim from 20261008073324_notification_emission.sql with
-- only the emission condition changed. `create or replace`, same signature: grants stand.

create or replace function public.upsert_tour_suggestions(
  p_tour_id uuid,
  p_batch_id uuid,
  p_items jsonb
) returns jsonb
  language plpgsql
  security definer
  set search_path = public, extensions
as $$
declare
  v_owner uuid;
  v_item jsonb;
  v_field text;
  v_target uuid;
  v_pending int;
  v_is_new boolean;
begin
  v_owner := public.fn_assert_can_suggest(p_tour_id);

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'tour_suggestion.invalid_items' using errcode = 'P0001';
  end if;

  v_is_new := not exists (
    select 1 from public.tour_suggestion
    where batch_id = p_batch_id and suggester_id = auth.uid() and status = 'pending'
  );

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_field := v_item->>'field';
    v_target := nullif(v_item->>'targetId', '')::uuid;

    insert into public.tour_suggestion (
      tour_id, owner_id, suggester_id, batch_id, field, value, base_value, target_id
    ) values (
      p_tour_id,
      v_owner,
      auth.uid(),
      p_batch_id,
      v_field,
      case when v_item->'value' = 'null'::jsonb then null else v_item->'value' end,
      public.tour_field_value(p_tour_id, v_field),
      v_target
    )
    on conflict (
      tour_id, suggester_id, field, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid)
    ) where status = 'pending'
    do update set
      batch_id   = excluded.batch_id,
      value      = excluded.value,
      -- Refresh the base on revision (D4): a just-revised proposal is never stale.
      base_value = excluded.base_value;
  end loop;

  -- Fields reverted to the tour's own value are absent from p_items — withdraw them.
  update public.tour_suggestion s
     set status = 'withdrawn', resolved_at = now()
   where s.tour_id = p_tour_id
     and s.suggester_id = auth.uid()
     and s.status = 'pending'
     and not exists (
       select 1 from jsonb_array_elements(p_items) i
       where i->>'field' = s.field
         and nullif(i->>'targetId', '')::uuid is not distinct from s.target_id
     );

  select count(*) into v_pending
  from public.tour_suggestion s
  where s.tour_id = p_tour_id and s.suggester_id = auth.uid() and s.status = 'pending';

  if jsonb_array_length(p_items) > 0 then
    perform public.fn_emit_notification(
      array[v_owner], 'tour_suggestions',
      case when v_is_new then 'suggestion_submitted' else 'suggestion_revised' end, p_tour_id,
      (select name from public.tours where id = p_tour_id),
      jsonb_build_object('batch_id', p_batch_id)
    );
  end if;

  return jsonb_build_object('batch_id', p_batch_id, 'pending_count', v_pending);
end;
$$;
