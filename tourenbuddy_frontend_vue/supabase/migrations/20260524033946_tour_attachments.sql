-- ============================================================
-- tour_attachments: per-tour file attachments
-- ============================================================

-- 1. Table -------------------------------------------------------
CREATE TABLE "public"."tour_attachments" (
  "id"                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tour_id"           uuid        NOT NULL REFERENCES "public"."tours"("id") ON DELETE CASCADE,
  "user_id"           uuid        NOT NULL REFERENCES "auth"."users"("id") ON DELETE CASCADE,
  "storage_path"      text        NOT NULL,
  "mime_type"         text        NOT NULL CHECK ("mime_type" IN ('image/png', 'image/jpeg', 'application/pdf')),
  "size_bytes"        bigint      NOT NULL CHECK ("size_bytes" > 0 AND "size_bytes" <= 10485760),
  "original_filename" text        NOT NULL,
  "sort_order"        int         NOT NULL DEFAULT 0,
  "created_at"        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "tour_attachments_tour_id_sort_order_idx"
  ON "public"."tour_attachments" ("tour_id", "sort_order");

-- 2. RLS ---------------------------------------------------------
ALTER TABLE "public"."tour_attachments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tour_attachments_select_own"
  ON "public"."tour_attachments" FOR SELECT
  TO "authenticated"
  USING ("user_id" = "auth"."uid"());

CREATE POLICY "tour_attachments_insert_own"
  ON "public"."tour_attachments" FOR INSERT
  TO "authenticated"
  WITH CHECK ("user_id" = "auth"."uid"());

CREATE POLICY "tour_attachments_update_own"
  ON "public"."tour_attachments" FOR UPDATE
  TO "authenticated"
  USING ("user_id" = "auth"."uid"())
  WITH CHECK ("user_id" = "auth"."uid"());

CREATE POLICY "tour_attachments_delete_own"
  ON "public"."tour_attachments" FOR DELETE
  TO "authenticated"
  USING ("user_id" = "auth"."uid"());

-- 3. 5-file cap trigger ------------------------------------------
CREATE OR REPLACE FUNCTION "public"."check_tour_attachment_limit"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Lock parent tour row to serialize concurrent inserts
  PERFORM 1 FROM "public"."tours" WHERE "id" = NEW.tour_id FOR UPDATE;

  IF (SELECT COUNT(*) FROM "public"."tour_attachments" WHERE "tour_id" = NEW.tour_id) >= 5 THEN
    RAISE EXCEPTION 'tour_attachment_limit_exceeded: a tour may have at most 5 attachments';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "tour_attachments_cap_check"
  BEFORE INSERT ON "public"."tour_attachments"
  FOR EACH ROW EXECUTE FUNCTION "public"."check_tour_attachment_limit"();

-- 4. Private storage bucket + policies ---------------------------
INSERT INTO "storage"."buckets" ("id", "name", "public", "file_size_limit", "allowed_mime_types")
VALUES (
  'tour-attachments',
  'tour-attachments',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'application/pdf']
)
ON CONFLICT ("id") DO NOTHING;

CREATE POLICY "tour_attachments_storage_select_own"
  ON "storage"."objects" FOR SELECT
  TO "authenticated"
  USING (
    "bucket_id" = 'tour-attachments'
    AND split_part("name", '/', 1) = "auth"."uid"()::text
  );

CREATE POLICY "tour_attachments_storage_insert_own"
  ON "storage"."objects" FOR INSERT
  TO "authenticated"
  WITH CHECK (
    "bucket_id" = 'tour-attachments'
    AND split_part("name", '/', 1) = "auth"."uid"()::text
  );

CREATE POLICY "tour_attachments_storage_update_own"
  ON "storage"."objects" FOR UPDATE
  TO "authenticated"
  USING (
    "bucket_id" = 'tour-attachments'
    AND split_part("name", '/', 1) = "auth"."uid"()::text
  )
  WITH CHECK (
    "bucket_id" = 'tour-attachments'
    AND split_part("name", '/', 1) = "auth"."uid"()::text
  );

CREATE POLICY "tour_attachments_storage_delete_own"
  ON "storage"."objects" FOR DELETE
  TO "authenticated"
  USING (
    "bucket_id" = 'tour-attachments'
    AND split_part("name", '/', 1) = "auth"."uid"()::text
  );

-- 5. RPC: update attachment order --------------------------------
CREATE OR REPLACE FUNCTION "public"."update_attachment_order"(
  "tour_id"     uuid,
  "ordered_ids" uuid[]
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
    WHERE "tour_id" = "update_attachment_order"."tour_id"
      AND "user_id" = "auth"."uid"()
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'not_owner: caller does not own attachments for this tour';
  END IF;

  FOR v_idx IN 1..array_length("ordered_ids", 1) LOOP
    v_id := "ordered_ids"[v_idx];
    UPDATE "public"."tour_attachments"
    SET "sort_order" = v_idx - 1
    WHERE "id" = v_id
      AND "tour_id" = "update_attachment_order"."tour_id"
      AND "user_id" = "auth"."uid"();
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION "public"."update_attachment_order"(uuid, uuid[]) TO "authenticated";
