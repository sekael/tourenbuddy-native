import { z } from 'zod';

/**
 * The suggestable LOGICAL fields (design D2) — not columns. Coupled and derived columns
 * travel together so a partial accept can never produce invalid data:
 *  - `dates` carries both dates, or an accepted `end_date` could trip
 *    `tours_end_date_after_start` against an unchanged `planned_date`.
 *  - `start_point` / `end_point` carry the name and elevation derived from the
 *    coordinates, or an accepted coordinate keeps a label describing the old place.
 *  - `goal` carries its looked-up elevation when the coordinates move.
 *
 * `visibility` and `completed` are absent by design (the privacy control itself, and the
 * owner's factual assertion about their own day), and the partner set is structurally
 * unsuggestable — `tour_partners.contact_id` lives in the owner's namespace.
 *
 * `dates` also carries the start time (`startTime`, only when set), which needs a date.
 *
 * IMPORTANT: this list is duplicated in exactly one other place, the SQL CHECK constraint
 * (newest in `20261022192018_tour_grade_start_time.sql`). `tour-suggestion.test.ts` reads the
 * newest migration that sets it and asserts the two match, so drift fails CI.
 */
export const SUGGESTABLE_FIELDS = [
  'name',
  'dates',
  'goal',
  'tour_type',
  'elevation',
  'description',
  'seasons',
  'equipment',
  'notes',
  'start_point',
  'end_point',
  'gpx',
  'attachment_add',
  'attachment_remove',
  'grade',
] as const;

export const suggestionFieldSchema = z.enum(SUGGESTABLE_FIELDS);
export const suggestionStatusSchema = z.enum(['pending', 'accepted', 'declined', 'withdrawn']);

/** Fields whose accept is a plain column write — everything except the binary ops (D3). */
export const SCALAR_SUGGESTION_FIELDS = SUGGESTABLE_FIELDS.filter(
  (f) => f !== 'attachment_add' && f !== 'attachment_remove' && f !== 'gpx',
);

/** Value shape carried by a staged blob suggestion (`gpx` / `attachment_add`, D3). */
export const stagedFileValueSchema = z.object({
  storagePath: z.string(),
  mimeType: z.string().optional(),
  sizeBytes: z.number().optional(),
  originalFilename: z.string().optional(),
});

/**
 * Raw row from `tour_suggestion_view` (snake_case), transformed to the domain shape —
 * mirrors `tour-schema.ts`. `is_stale` and `current_value` are computed server-side by
 * `tour_field_value`, the single serializer, so the client never compares values itself.
 */
export const tourSuggestionRowSchema = z
  .object({
    id: z.string(),
    tour_id: z.string(),
    owner_id: z.string(),
    suggester_id: z.string(),
    batch_id: z.string(),
    field: suggestionFieldSchema,
    value: z.unknown().nullable().default(null),
    base_value: z.unknown().nullable().default(null),
    current_value: z.unknown().nullable().default(null),
    target_id: z.string().nullable().default(null),
    status: suggestionStatusSchema,
    is_stale: z.boolean().default(false),
    created_at: z.string(),
    resolved_at: z.string().nullable().default(null),
    suggester_first_name: z.string().nullable().default(null),
    suggester_last_name: z.string().nullable().default(null),
  })
  .transform((row) => ({
    id: row.id,
    tourId: row.tour_id,
    ownerId: row.owner_id,
    suggesterId: row.suggester_id,
    batchId: row.batch_id,
    field: row.field,
    value: row.value ?? null,
    baseValue: row.base_value ?? null,
    currentValue: row.current_value ?? null,
    targetId: row.target_id,
    status: row.status,
    isStale: row.is_stale,
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    suggesterFirstName: row.suggester_first_name,
    suggesterLastName: row.suggester_last_name,
  }));
