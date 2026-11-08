-- Fix ambiguous column reference in update_attachment_order:
-- Parameter names "tour_id" / "ordered_ids" conflicted with same-named table
-- columns inside PL/pgSQL. Renamed to "p_tour_id" / "p_ordered_ids".
-- DROP required because Postgres forbids renaming params via CREATE OR REPLACE.
DROP FUNCTION IF EXISTS "public"."update_attachment_order"(uuid, uuid[]);

CREATE FUNCTION "public"."update_attachment_order"(
  "p_tour_id"     uuid,
  "p_ordered_ids" uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   uuid;
  v_idx  int;
BEGIN
  -- Verify caller owns at least one attachment in this tour
  IF NOT EXISTS (
    SELECT 1 FROM "public"."tour_attachments"
    WHERE "tour_id" = p_tour_id
      AND "user_id" = "auth"."uid"()
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'not_owner: caller does not own attachments for this tour';
  END IF;

  FOR v_idx IN 1..array_length(p_ordered_ids, 1) LOOP
    v_id := p_ordered_ids[v_idx];
    UPDATE "public"."tour_attachments"
    SET "sort_order" = v_idx - 1
    WHERE "id" = v_id
      AND "tour_id" = p_tour_id
      AND "user_id" = "auth"."uid"();
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."update_attachment_order"(uuid, uuid[]) TO "authenticated";
