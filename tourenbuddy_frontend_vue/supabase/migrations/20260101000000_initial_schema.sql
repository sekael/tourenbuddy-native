CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."contact_method_type" AS ENUM (
    'phone',
    'email'
);


ALTER TYPE "public"."contact_method_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller_id uuid := auth.uid();
  v_from uuid;
  v_to uuid;
  v_status text;
begin
  select from_user_id, to_user_id, status
  into v_from, v_to, v_status
  from public.friend_requests
  where id = p_request_id;

  if not found then
    raise exception 'Friend request not found';
  end if;

  if v_caller_id <> v_to then
    raise exception 'Only the recipient can accept a friend request';
  end if;

  if v_status = 'accepted' then
    return; -- idempotent
  end if;

  if v_status <> 'pending' then
    raise exception 'Friend request is not pending';
  end if;

  update public.friend_requests
  set status = 'accepted', responded_at = now()
  where id = p_request_id;

  insert into public.friendships (request_user_id, response_user_id, request_id)
  values (v_from, v_to, p_request_id)
  on conflict (least(request_user_id, response_user_id), greatest(request_user_id, response_user_id))
  do nothing;
end;
$$;


ALTER FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_tour_full"("p_id" "uuid", "p_planned_date" "date" DEFAULT NULL::"date", "p_name" "text" DEFAULT NULL::"text", "p_goal" "text" DEFAULT NULL::"text", "p_partner_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "p_tour_type" "text" DEFAULT NULL::"text", "p_elevation" numeric DEFAULT NULL::numeric, "p_gpx_filepath" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_seasons" "text"[] DEFAULT NULL::"text"[], "p_start_point" "text" DEFAULT NULL::"text", "p_end_point" "text" DEFAULT NULL::"text", "p_equipment" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_start_point_name" "text" DEFAULT NULL::"text", "p_start_point_elevation" integer DEFAULT NULL::integer, "p_end_point_name" "text" DEFAULT NULL::"text", "p_end_point_elevation" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.tours (
    id,
    planned_date,
    name,
    goal,
    user_id,
    tour_type,
    elevation,
    gpx_filepath,
    description,
    seasons,
    start_point,
    end_point,
    equipment,
    notes,
    start_point_name,
    start_point_elevation,
    end_point_name,
    end_point_elevation
  ) values (
    p_id,
    p_planned_date,
    p_name,
    p_goal::geography,
    auth.uid(),
    p_tour_type,
    p_elevation,
    p_gpx_filepath,
    p_description,
    p_seasons,
    case when p_start_point is not null then p_start_point::geography else null end,
    case when p_end_point is not null then p_end_point::geography else null end,
    p_equipment,
    p_notes,
    p_start_point_name,
    p_start_point_elevation,
    p_end_point_name,
    p_end_point_elevation
  );

  if array_length(p_partner_ids, 1) > 0 then
    insert into public.tour_partners (tour_id, contact_id)
    select p_id, unnest(p_partner_ids);
  end if;
end;
$$;


ALTER FUNCTION "public"."create_tour_full"("p_id" "uuid", "p_planned_date" "date", "p_name" "text", "p_goal" "text", "p_partner_ids" "uuid"[], "p_tour_type" "text", "p_elevation" numeric, "p_gpx_filepath" "text", "p_description" "text", "p_seasons" "text"[], "p_start_point" "text", "p_end_point" "text", "p_equipment" "text", "p_notes" "text", "p_start_point_name" "text", "p_start_point_elevation" integer, "p_end_point_name" "text", "p_end_point_elevation" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_phones_by_user_ids"("p_user_ids" "uuid"[]) RETURNS TABLE("user_id" "uuid", "phone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller_id uuid := auth.uid();
begin
  if not exists (
    select 1 from auth.users where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return;
  end if;

  return query
  select u.id, ('+' || u.phone)::text
  from auth.users u
  where u.id = any(p_user_ids)
    and u.phone_confirmed_at is not null
    and (
      exists (
        select 1 from public.friend_requests fr
        where fr.status = 'pending'
          and (
            (fr.from_user_id = v_caller_id and fr.to_user_id = u.id)
            or (fr.from_user_id = u.id and fr.to_user_id = v_caller_id)
          )
      )
      or exists (
        select 1 from public.friendships f
        where (f.request_user_id = v_caller_id and f.response_user_id = u.id)
           or (f.request_user_id = u.id and f.response_user_id = v_caller_id)
      )
    );
end;
$$;


ALTER FUNCTION "public"."find_phones_by_user_ids"("p_user_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_user_by_phone"("p_phone" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller_id uuid := auth.uid();
  v_normalized text := ltrim(p_phone, '+');
  v_result uuid;
begin
  if not exists (
    select 1 from auth.users
    where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return null;
  end if;

  select id into v_result
  from auth.users
  where phone = v_normalized
    and phone_confirmed_at is not null
    and id <> v_caller_id
  limit 1;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."find_user_by_phone"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."find_users_by_phones"("p_phones" "text"[]) RETURNS TABLE("phone" "text", "user_id" "uuid")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller_id uuid := auth.uid();
  v_normalized text[];
begin
  if not exists (
    select 1 from auth.users
    where id = v_caller_id and phone_confirmed_at is not null
  ) then
    return;
  end if;

  -- Strip leading '+' from each input phone before comparing
  select array_agg(ltrim(p, '+'))
  into v_normalized
  from unnest(p_phones) as p;

  return query
  select ('+' || u.phone)::text, u.id
  from auth.users u
  where u.phone = any(v_normalized)
    and u.phone_confirmed_at is not null
    and u.id <> v_caller_id;
end;
$$;


ALTER FUNCTION "public"."find_users_by_phones"("p_phones" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_phone_verified"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1 from auth.users
    where id = p_user_id and phone_confirmed_at is not null
  );
$$;


ALTER FUNCTION "public"."is_phone_verified"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_friendship"("p_other_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_caller_id uuid := auth.uid();
begin
  delete from public.friendships
  where (request_user_id = v_caller_id and response_user_id = p_other_user_id)
     or (request_user_id = p_other_user_id and response_user_id = v_caller_id);
end;
$$;


ALTER FUNCTION "public"."remove_friendship"("p_other_user_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."contact_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "method_type" "public"."contact_method_type" NOT NULL,
    "value" "text" NOT NULL,
    "label" "text",
    "is_primary" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."contact_methods" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_primary_phone"("p_contact_id" "uuid", "p_method_id" "uuid") RETURNS SETOF "public"."contact_methods"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE contact_methods
    SET is_primary = false
  WHERE contact_id = p_contact_id
    AND method_type = 'phone'
    AND id <> p_method_id;

  UPDATE contact_methods
    SET is_primary = true
  WHERE id = p_method_id
    AND contact_id = p_contact_id
    AND method_type = 'phone';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'method % not found for contact % or is not a phone method', p_method_id, p_contact_id;
  END IF;

  RETURN QUERY
    SELECT * FROM contact_methods
    WHERE contact_id = p_contact_id
      AND method_type = 'phone';
END;
$$;


ALTER FUNCTION "public"."set_primary_phone"("p_contact_id" "uuid", "p_method_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tour_full"("p_id" "uuid", "p_planned_date" "date" DEFAULT NULL::"date", "p_name" "text" DEFAULT NULL::"text", "p_goal" "text" DEFAULT NULL::"text", "p_partner_ids" "uuid"[] DEFAULT '{}'::"uuid"[], "p_tour_type" "text" DEFAULT NULL::"text", "p_elevation" numeric DEFAULT NULL::numeric, "p_gpx_filepath" "text" DEFAULT NULL::"text", "p_description" "text" DEFAULT NULL::"text", "p_seasons" "text"[] DEFAULT NULL::"text"[], "p_start_point" "text" DEFAULT NULL::"text", "p_end_point" "text" DEFAULT NULL::"text", "p_equipment" "text" DEFAULT NULL::"text", "p_notes" "text" DEFAULT NULL::"text", "p_start_point_name" "text" DEFAULT NULL::"text", "p_start_point_elevation" integer DEFAULT NULL::integer, "p_end_point_name" "text" DEFAULT NULL::"text", "p_end_point_elevation" integer DEFAULT NULL::integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  if not exists (
    select 1 from public.tours where id = p_id and user_id = auth.uid()
  ) then
    raise exception 'Tour not found or access denied';
  end if;

  update public.tours set
    planned_date          = p_planned_date,
    name                  = p_name,
    goal                  = p_goal::geography,
    tour_type             = p_tour_type,
    elevation             = p_elevation,
    gpx_filepath          = p_gpx_filepath,
    description           = p_description,
    seasons               = p_seasons,
    start_point           = case when p_start_point is not null then p_start_point::geography else null end,
    end_point             = case when p_end_point   is not null then p_end_point::geography   else null end,
    equipment             = p_equipment,
    notes                 = p_notes,
    start_point_name      = p_start_point_name,
    start_point_elevation = p_start_point_elevation,
    end_point_name        = p_end_point_name,
    end_point_elevation   = p_end_point_elevation
  where id = p_id;

  delete from public.tour_partners where tour_id = p_id;

  if p_partner_ids is not null and array_length(p_partner_ids, 1) > 0 then
    insert into public.tour_partners (tour_id, contact_id)
    select p_id, unnest(p_partner_ids);
  end if;
end;
$$;


ALTER FUNCTION "public"."update_tour_full"("p_id" "uuid", "p_planned_date" "date", "p_name" "text", "p_goal" "text", "p_partner_ids" "uuid"[], "p_tour_type" "text", "p_elevation" numeric, "p_gpx_filepath" "text", "p_description" "text", "p_seasons" "text"[], "p_start_point" "text", "p_end_point" "text", "p_equipment" "text", "p_notes" "text", "p_start_point_name" "text", "p_start_point_elevation" integer, "p_end_point_name" "text", "p_end_point_elevation" integer) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "display_name" "text",
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friend_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "from_user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "to_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "responded_at" timestamp with time zone,
    CONSTRAINT "friend_requests_check" CHECK (("from_user_id" <> "to_user_id")),
    CONSTRAINT "friend_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'denied'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."friend_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "request_user_id" "uuid" NOT NULL,
    "response_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_id" "uuid"
);


ALTER TABLE "public"."friendships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tour_partners" (
    "tour_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL
);


ALTER TABLE "public"."tour_partners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "planned_date" "date",
    "user_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "goal" "extensions"."geography"(Point,4326) NOT NULL,
    "name" "text",
    "tour_type" "text",
    "elevation" numeric,
    "description" "text",
    "seasons" "text"[],
    "start_point" "extensions"."geography"(Point,4326),
    "end_point" "extensions"."geography"(Point,4326),
    "equipment" "text",
    "notes" "text",
    "completed" boolean DEFAULT false NOT NULL,
    "start_point_name" "text",
    "start_point_elevation" integer,
    "end_point_name" "text",
    "end_point_elevation" integer,
    "gpx_filepath" "text",
    CONSTRAINT "tours_name_check" CHECK (("length"("name") < 100)),
    CONSTRAINT "tours_tour_type_check" CHECK ((("tour_type" IS NULL) OR ("tour_type" = ANY (ARRAY['skiing'::"text", 'snowboarding'::"text", 'skitour'::"text", 'splitboarding'::"text", 'ski-mountaineering'::"text", 'paragliding'::"text", 'hiking'::"text", 'mountaineering'::"text", 'climbing'::"text", 'mountain-biking'::"text", 'trailrunning'::"text"]))))
);


ALTER TABLE "public"."tours" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."tours_view" AS
 SELECT "id",
    "user_id",
    "planned_date",
    "name",
    "extensions"."st_x"(("goal")::"extensions"."geometry") AS "lon",
    "extensions"."st_y"(("goal")::"extensions"."geometry") AS "lat",
    "tour_type",
    "elevation",
    "gpx_filepath",
    "description",
    "seasons",
    "extensions"."st_x"(("start_point")::"extensions"."geometry") AS "start_lon",
    "extensions"."st_y"(("start_point")::"extensions"."geometry") AS "start_lat",
    "extensions"."st_x"(("end_point")::"extensions"."geometry") AS "end_lon",
    "extensions"."st_y"(("end_point")::"extensions"."geometry") AS "end_lat",
    "start_point_name",
    "start_point_elevation",
    "end_point_name",
    "end_point_elevation",
    "equipment",
    "notes",
    "completed",
    ( SELECT COALESCE("json_agg"("tp"."contact_id"), '[]'::json) AS "coalesce"
           FROM "public"."tour_partners" "tp"
          WHERE ("tp"."tour_id" = "t"."id")) AS "partner_ids"
   FROM "public"."tours" "t";


ALTER VIEW "public"."tours_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profile" (
    "id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "locale" "text",
    "notif_push_enabled" boolean DEFAULT true NOT NULL,
    "notif_email_enabled" boolean DEFAULT true NOT NULL,
    "notif_muted_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "user_profile_locale_check" CHECK ((("locale" IS NULL) OR ("locale" = ANY (ARRAY['en'::"text", 'de-CH'::"text"]))))
);


ALTER TABLE "public"."user_profile" OWNER TO "postgres";


ALTER TABLE ONLY "public"."contact_methods"
    ADD CONSTRAINT "contact_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_methods"
    ADD CONSTRAINT "contact_methods_unique_per_contact" UNIQUE ("contact_id", "method_type", "value");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("request_user_id", "response_user_id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_endpoint_key" UNIQUE ("endpoint");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tour_partners"
    ADD CONSTRAINT "tour_partners_pkey" PRIMARY KEY ("tour_id", "contact_id");



ALTER TABLE ONLY "public"."tours"
    ADD CONSTRAINT "tours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "contact_methods_one_primary_email" ON "public"."contact_methods" USING "btree" ("contact_id") WHERE (("method_type" = 'email'::"public"."contact_method_type") AND "is_primary");



CREATE UNIQUE INDEX "contact_methods_one_primary_phone" ON "public"."contact_methods" USING "btree" ("contact_id") WHERE (("method_type" = 'phone'::"public"."contact_method_type") AND "is_primary");



CREATE UNIQUE INDEX "friend_requests_pending_pair_idx" ON "public"."friend_requests" USING "btree" ("from_user_id", "to_user_id") WHERE ("status" = 'pending'::"text");



CREATE UNIQUE INDEX "friendships_unordered_pair_idx" ON "public"."friendships" USING "btree" (LEAST("request_user_id", "response_user_id"), GREATEST("request_user_id", "response_user_id"));



CREATE INDEX "push_subscriptions_user_id_idx" ON "public"."push_subscriptions" USING "btree" ("user_id");



CREATE INDEX "tour_partners_contact_id_idx" ON "public"."tour_partners" USING "btree" ("contact_id");



ALTER TABLE ONLY "public"."contact_methods"
    ADD CONSTRAINT "contact_methods_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profile"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friend_requests"
    ADD CONSTRAINT "friend_requests_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."friend_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_a_id_fkey" FOREIGN KEY ("request_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_user_b_id_fkey" FOREIGN KEY ("response_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tour_partners"
    ADD CONSTRAINT "tour_partners_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tour_partners"
    ADD CONSTRAINT "tour_partners_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tours"
    ADD CONSTRAINT "tours_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user_profile"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



CREATE POLICY "Users can manage their own push subscriptions" ON "public"."push_subscriptions" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."contact_methods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contact_methods_delete_own" ON "public"."contact_methods" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."contacts" "c"
  WHERE (("c"."id" = "contact_methods"."contact_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "contact_methods_insert_own" ON "public"."contact_methods" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."contacts" "c"
  WHERE (("c"."id" = "contact_methods"."contact_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "contact_methods_select_own" ON "public"."contact_methods" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."contacts" "c"
  WHERE (("c"."id" = "contact_methods"."contact_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "contact_methods_update_own" ON "public"."contact_methods" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."contacts" "c"
  WHERE (("c"."id" = "contact_methods"."contact_id") AND ("c"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."contacts" "c"
  WHERE (("c"."id" = "contact_methods"."contact_id") AND ("c"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_delete_own" ON "public"."contacts" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "contacts_insert_own" ON "public"."contacts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "contacts_select_own" ON "public"."contacts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "contacts_update_own" ON "public"."contacts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."friend_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friend_requests_insert" ON "public"."friend_requests" FOR INSERT WITH CHECK ((("auth"."uid"() = "from_user_id") AND "public"."is_phone_verified"("auth"."uid"()) AND "public"."is_phone_verified"("to_user_id")));



CREATE POLICY "friend_requests_select" ON "public"."friend_requests" FOR SELECT USING ((("auth"."uid"() = "from_user_id") OR ("auth"."uid"() = "to_user_id")));



CREATE POLICY "friend_requests_update_recipient" ON "public"."friend_requests" FOR UPDATE USING ((("auth"."uid"() = "to_user_id") AND ("status" = 'pending'::"text"))) WITH CHECK (("status" = ANY (ARRAY['accepted'::"text", 'denied'::"text"])));



CREATE POLICY "friend_requests_update_sender" ON "public"."friend_requests" FOR UPDATE USING ((("auth"."uid"() = "from_user_id") AND ("status" = 'pending'::"text"))) WITH CHECK (("status" = 'cancelled'::"text"));



ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "friendships_select" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "request_user_id") OR ("auth"."uid"() = "response_user_id")));



ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tour_partners" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tour_partners_delete_own" ON "public"."tour_partners" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tours" "t"
  WHERE (("t"."id" = "tour_partners"."tour_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "tour_partners_insert_own" ON "public"."tour_partners" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tours" "t"
  WHERE (("t"."id" = "tour_partners"."tour_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "tour_partners_select_own" ON "public"."tour_partners" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tours" "t"
  WHERE (("t"."id" = "tour_partners"."tour_id") AND ("t"."user_id" = "auth"."uid"())))));



CREATE POLICY "tour_partners_update_own" ON "public"."tour_partners" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tours" "t"
  WHERE (("t"."id" = "tour_partners"."tour_id") AND ("t"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tours" "t"
  WHERE (("t"."id" = "tour_partners"."tour_id") AND ("t"."user_id" = "auth"."uid"())))));



ALTER TABLE "public"."tours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tours_delete_own" ON "public"."tours" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "tours_insert_own" ON "public"."tours" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "tours_select_own" ON "public"."tours" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "tours_update_own" ON "public"."tours" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."user_profile" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_profile_insert_own" ON "public"."user_profile" FOR INSERT TO "authenticated" WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "user_profile_select_own" ON "public"."user_profile" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "user_profile_update_own" ON "public"."user_profile" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_friend_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_tour_full"("p_id" "uuid", "p_planned_date" "date", "p_name" "text", "p_goal" "text", "p_partner_ids" "uuid"[], "p_tour_type" "text", "p_elevation" numeric, "p_gpx_filepath" "text", "p_description" "text", "p_seasons" "text"[], "p_start_point" "text", "p_end_point" "text", "p_equipment" "text", "p_notes" "text", "p_start_point_name" "text", "p_start_point_elevation" integer, "p_end_point_name" "text", "p_end_point_elevation" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."create_tour_full"("p_id" "uuid", "p_planned_date" "date", "p_name" "text", "p_goal" "text", "p_partner_ids" "uuid"[], "p_tour_type" "text", "p_elevation" numeric, "p_gpx_filepath" "text", "p_description" "text", "p_seasons" "text"[], "p_start_point" "text", "p_end_point" "text", "p_equipment" "text", "p_notes" "text", "p_start_point_name" "text", "p_start_point_elevation" integer, "p_end_point_name" "text", "p_end_point_elevation" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_tour_full"("p_id" "uuid", "p_planned_date" "date", "p_name" "text", "p_goal" "text", "p_partner_ids" "uuid"[], "p_tour_type" "text", "p_elevation" numeric, "p_gpx_filepath" "text", "p_description" "text", "p_seasons" "text"[], "p_start_point" "text", "p_end_point" "text", "p_equipment" "text", "p_notes" "text", "p_start_point_name" "text", "p_start_point_elevation" integer, "p_end_point_name" "text", "p_end_point_elevation" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_phones_by_user_ids"("p_user_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."find_phones_by_user_ids"("p_user_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_phones_by_user_ids"("p_user_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."find_user_by_phone"("p_phone" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."find_user_by_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_user_by_phone"("p_phone" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."find_users_by_phones"("p_phones" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."find_users_by_phones"("p_phones" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."find_users_by_phones"("p_phones" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_phone_verified"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_phone_verified"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_phone_verified"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_friendship"("p_other_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_friendship"("p_other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_friendship"("p_other_user_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."contact_methods" TO "anon";
GRANT ALL ON TABLE "public"."contact_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_methods" TO "service_role";



GRANT ALL ON FUNCTION "public"."set_primary_phone"("p_contact_id" "uuid", "p_method_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_primary_phone"("p_contact_id" "uuid", "p_method_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_primary_phone"("p_contact_id" "uuid", "p_method_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_tour_full"("p_id" "uuid", "p_planned_date" "date", "p_name" "text", "p_goal" "text", "p_partner_ids" "uuid"[], "p_tour_type" "text", "p_elevation" numeric, "p_gpx_filepath" "text", "p_description" "text", "p_seasons" "text"[], "p_start_point" "text", "p_end_point" "text", "p_equipment" "text", "p_notes" "text", "p_start_point_name" "text", "p_start_point_elevation" integer, "p_end_point_name" "text", "p_end_point_elevation" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_tour_full"("p_id" "uuid", "p_planned_date" "date", "p_name" "text", "p_goal" "text", "p_partner_ids" "uuid"[], "p_tour_type" "text", "p_elevation" numeric, "p_gpx_filepath" "text", "p_description" "text", "p_seasons" "text"[], "p_start_point" "text", "p_end_point" "text", "p_equipment" "text", "p_notes" "text", "p_start_point_name" "text", "p_start_point_elevation" integer, "p_end_point_name" "text", "p_end_point_elevation" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tour_full"("p_id" "uuid", "p_planned_date" "date", "p_name" "text", "p_goal" "text", "p_partner_ids" "uuid"[], "p_tour_type" "text", "p_elevation" numeric, "p_gpx_filepath" "text", "p_description" "text", "p_seasons" "text"[], "p_start_point" "text", "p_end_point" "text", "p_equipment" "text", "p_notes" "text", "p_start_point_name" "text", "p_start_point_elevation" integer, "p_end_point_name" "text", "p_end_point_elevation" integer) TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."friend_requests" TO "anon";
GRANT ALL ON TABLE "public"."friend_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."friend_requests" TO "service_role";



GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."tour_partners" TO "anon";
GRANT ALL ON TABLE "public"."tour_partners" TO "authenticated";
GRANT ALL ON TABLE "public"."tour_partners" TO "service_role";



GRANT ALL ON TABLE "public"."tours" TO "anon";
GRANT ALL ON TABLE "public"."tours" TO "authenticated";
GRANT ALL ON TABLE "public"."tours" TO "service_role";



GRANT ALL ON TABLE "public"."tours_view" TO "anon";
GRANT ALL ON TABLE "public"."tours_view" TO "authenticated";
GRANT ALL ON TABLE "public"."tours_view" TO "service_role";



GRANT ALL ON TABLE "public"."user_profile" TO "anon";
GRANT ALL ON TABLE "public"."user_profile" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profile" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







