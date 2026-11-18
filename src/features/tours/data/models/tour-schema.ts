import type { TourType } from './tour-type';
import { z } from 'zod';
import { seasonSchema } from './season';
import { tourTypeSchema } from './tour-type';
import { visibilitySchema } from './visibility';

const pointSchema = z.object({ lng: z.number(), lat: z.number() });

/** A tour partner surfaced to a friend viewer: a registered user, by profile name. */
const partnerNameSchema = z.object({
  userId: z.string(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
});

export type PartnerName = z.infer<typeof partnerNameSchema>;

/** A tour's place in an outing (#338): the outing's id and name, and the segment's order key. */
const outingSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  position: z.number().int(),
});

export type TourOuting = z.infer<typeof outingSchema>;

/** Outing columns shared by both views; arrive null for a standalone tour. */
const outingColumns = {
  outing_id: z.string().nullable().default(null),
  outing_name: z.string().nullable().default(null),
  outing_position: z.number().int().nullable().default(null),
};

/** Grade, start time ("HH:MM", the views format it) and the legs, shared by both views. */
const planColumns = {
  grade: z.string().nullable().default(null),
  start_time: z.string().nullable().default(null),
  ascent_types: z.array(tourTypeSchema).nullable().default(null),
  descent_types: z.array(tourTypeSchema).nullable().default(null),
};

function legsFromRow(row: { ascent_types: TourType[] | null; descent_types: TourType[] | null }) {
  return row.ascent_types && row.descent_types
    ? { ascent: row.ascent_types, descent: row.descent_types }
    : null;
}

function outingFromRow(row: {
  outing_id: string | null;
  outing_name: string | null;
  outing_position: number | null;
}) {
  return row.outing_id != null && row.outing_position != null
    ? { id: row.outing_id, name: row.outing_name, position: row.outing_position }
    : null;
}

/** Raw shape from Supabase `tours_view` (snake_case). */
export const tourRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    planned_date: z.string().nullable(),
    end_date: z.string().nullable().default(null),
    lon: z.number(),
    lat: z.number(),
    name: z.string().nullable(),
    partner_ids: z.array(z.string()).default([]),
    tour_types: z.array(tourTypeSchema).default([]),
    elevation: z.number().nullable().default(null),
    gpx_filepath: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    seasons: z.array(seasonSchema).nullable().default(null),
    start_lon: z.number().nullable().default(null),
    start_lat: z.number().nullable().default(null),
    end_lon: z.number().nullable().default(null),
    end_lat: z.number().nullable().default(null),
    start_point_name: z.string().nullable().default(null),
    start_point_elevation: z.number().int().nullable().default(null),
    end_point_name: z.string().nullable().default(null),
    end_point_elevation: z.number().int().nullable().default(null),
    equipment: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
    completed: z.boolean().default(false),
    visibility: visibilitySchema.default('friends'),
    updated_at: z.string().nullable().default(null),
    ...outingColumns,
    ...planColumns,
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    plannedDate: row.planned_date ? new Date(row.planned_date) : null,
    endDate: row.end_date ? new Date(row.end_date) : null,
    goal: { lng: row.lon, lat: row.lat },
    name: row.name,
    partnerIds: row.partner_ids,
    tourTypes: row.tour_types,
    elevation: row.elevation,
    gpxFilepath: row.gpx_filepath,
    description: row.description,
    seasons: row.seasons,
    startPoint:
      row.start_lon != null && row.start_lat != null
        ? { lng: row.start_lon, lat: row.start_lat }
        : null,
    endPoint:
      row.end_lon != null && row.end_lat != null ? { lng: row.end_lon, lat: row.end_lat } : null,
    startPointName: row.start_point_name,
    startPointElevation: row.start_point_elevation,
    endPointName: row.end_point_name,
    endPointElevation: row.end_point_elevation,
    equipment: row.equipment,
    notes: row.notes,
    completed: row.completed,
    visibility: row.visibility,
    updatedAt: row.updated_at,
    outing: outingFromRow(row),
    grade: row.grade,
    startTime: row.start_time,
    legs: legsFromRow(row),
    isFriendTour: false,
  }));

/** Domain-level tour shape. */
export const tourSchema = z.object({
  id: z.string(),
  userId: z.string(),
  /** Span START. Null means undated. */
  plannedDate: z.coerce.date().nullable(),
  /**
   * Span END, inclusive. Null means a single-day tour.
   *
   * ponytail: a `tours:<uid>` snapshot cached before multi-day-tours shipped hydrates with
   * this key ABSENT, not null — `entity-cache.ts` structured-clones with no zod parse on
   * read. Behaviourally identical: every consumer branches on truthiness (`?? plannedDate`,
   * `spanDayKeys`, the notification diff's `?.getTime() ?? null`), none tests `=== null` or
   * key presence, and `cachedLoad` is hydrate-then-refetch so the shape self-heals on the
   * next online load. Do NOT add defensive `?? null` at read sites for it.
   */
  endDate: z.coerce.date().nullable().default(null),
  goal: pointSchema,
  name: z.string().nullable(),
  partnerIds: z.array(z.string()),
  /** Activity types in `TOUR_TYPE_VALUES` order; empty = untyped. The first is the primary type. */
  tourTypes: z.array(tourTypeSchema),
  elevation: z.number().nullable(),
  gpxFilepath: z.string().nullable(),
  description: z.string().nullable(),
  seasons: z.array(seasonSchema).nullable(),
  startPoint: pointSchema.nullable(),
  endPoint: pointSchema.nullable(),
  startPointName: z.string().nullable(),
  startPointElevation: z.number().nullable(),
  endPointName: z.string().nullable(),
  endPointElevation: z.number().nullable(),
  equipment: z.string().nullable(),
  notes: z.string().nullable(),
  completed: z.boolean(),
  visibility: visibilitySchema,
  /** Server-stamped last-write time (ISO); the LWW baseline for offline-write-sync (DC5). Null for friend tours. */
  updatedAt: z.string().nullable().default(null),
  /**
   * Outing membership (#338); null = standalone. A snapshot cached before #338 hydrates with the
   * key absent — every reader branches on truthiness, and `cachedLoad` refetches it away.
   */
  outing: outingSchema.nullable().default(null),
  /**
   * Free-text grade in the activity's own scale ("T4", "ZS-", "S2", "5c"); null = none. Like
   * `outing`, a snapshot cached before it existed hydrates with the key absent.
   */
  grade: z.string().nullable().default(null),
  /** Start time "HH:MM" on `plannedDate`; null = none (always null without a date). */
  startTime: z.string().nullable().default(null),
  /**
   * Activities per leg (activity-legs): the way up (start → goal) and the way down (goal → end);
   * null = all of `tourTypes` both ways. A snapshot cached before it existed hydrates without.
   */
  legs: z
    .object({ ascent: z.array(tourTypeSchema), descent: z.array(tourTypeSchema) })
    .nullable()
    .default(null),
  /** True when this tour belongs to a friend (read via friend_tours_view), not the viewer. */
  isFriendTour: z.boolean().default(false),
  /** Friend-tour only: whether the viewer is a marked partner (drives detail gating). */
  isPartner: z.boolean().optional(),
  /** Friend-tour only: partners as registered-user names (owner contacts never exposed). */
  partnerNames: z.array(partnerNameSchema).optional(),
  /** Friend-tour only: count of partner contacts that resolve to no registered user. */
  unresolvedPartnerCount: z.number().int().nonnegative().optional(),
});

/**
 * Raw shape from `friend_tours_view`. Gated columns (planned_date, end_date, gpx_filepath)
 * arrive null for non-partner viewers; partners surface as `partner_names`, never
 * the owner's raw contact ids. Maps to the same domain `Tour` with `isFriendTour`.
 */
export const friendTourRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    planned_date: z.string().nullable(),
    end_date: z.string().nullable().default(null),
    lon: z.number(),
    lat: z.number(),
    name: z.string().nullable(),
    tour_types: z.array(tourTypeSchema).default([]),
    elevation: z.number().nullable().default(null),
    gpx_filepath: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    seasons: z.array(seasonSchema).nullable().default(null),
    start_lon: z.number().nullable().default(null),
    start_lat: z.number().nullable().default(null),
    end_lon: z.number().nullable().default(null),
    end_lat: z.number().nullable().default(null),
    start_point_name: z.string().nullable().default(null),
    start_point_elevation: z.number().int().nullable().default(null),
    end_point_name: z.string().nullable().default(null),
    end_point_elevation: z.number().int().nullable().default(null),
    equipment: z.string().nullable().default(null),
    notes: z.string().nullable().default(null),
    completed: z.boolean().default(false),
    is_partner: z.boolean().default(false),
    partner_names: z.array(partnerNameSchema).default([]),
    unresolved_partner_count: z.number().int().nonnegative().default(0),
    visibility: visibilitySchema.default('friends'),
    ...outingColumns,
    ...planColumns,
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    plannedDate: row.planned_date ? new Date(row.planned_date) : null,
    endDate: row.end_date ? new Date(row.end_date) : null,
    goal: { lng: row.lon, lat: row.lat },
    name: row.name,
    partnerIds: [] as string[],
    tourTypes: row.tour_types,
    elevation: row.elevation,
    gpxFilepath: row.gpx_filepath,
    description: row.description,
    seasons: row.seasons,
    startPoint:
      row.start_lon != null && row.start_lat != null
        ? { lng: row.start_lon, lat: row.start_lat }
        : null,
    endPoint:
      row.end_lon != null && row.end_lat != null ? { lng: row.end_lon, lat: row.end_lat } : null,
    startPointName: row.start_point_name,
    startPointElevation: row.start_point_elevation,
    endPointName: row.end_point_name,
    endPointElevation: row.end_point_elevation,
    equipment: row.equipment,
    notes: row.notes,
    completed: row.completed,
    visibility: row.visibility,
    updatedAt: null, // friend tours are read-only — never queued, no LWW baseline
    outing: outingFromRow(row),
    grade: row.grade,
    startTime: row.start_time,
    legs: legsFromRow(row),
    isFriendTour: true,
    isPartner: row.is_partner,
    partnerNames: row.partner_names,
    unresolvedPartnerCount: row.unresolved_partner_count,
  }));
