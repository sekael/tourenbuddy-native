import type { TourType } from '@/features/tours/data/models/tour-type';
import type { Tour, TourDraft } from '@/features/tours/domain/entities/tour';
import type {
  SuggestionField,
  SuggestionItem,
} from '@/features/tours/domain/entities/tour-suggestion';
import { legsMatch } from '@/features/tours/domain/legs';

/** A geographic point as both the tour and the draft carry it. */
type Point = { lng: number; lat: number } | null;
/** A `tour_type` value: the plain list, or with legs an object (activity-legs D6). */
type ActivitiesValue =
  TourType[] | { types: TourType[]; ascent?: TourType[]; descent?: TourType[] };

/** Coordinates are compared at ~1 cm; a re-render must not read as an edit. */
const COORD_EPSILON = 1e-7;

export function pointsEqual(a: Point, b: Point): boolean {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a.lng - b.lng) < COORD_EPSILON && Math.abs(a.lat - b.lat) < COORD_EPSILON;
}

/** Dates are compared by calendar day — the form carries a Date, the DB a `date`. */
export function datesEqual(a: Date | null, b: Date | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.toDateString() === b.toDateString();
}

export function seasonsEqual(a: string[] | null, b: string[] | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** `''` from a cleared text input and `null` from the DB are the same absence. */
export function textEqual(a: string | null, b: string | null): boolean {
  return (a ?? '') === (b ?? '');
}

/**
 * Seed the form from the author's OWN pending values when revising (design D12), not from
 * the tour: a revision continues the proposal, so the fields they already changed must
 * come back as they left them. Fields they never touched fall through to the tour's value.
 *
 * `gpx` and the attachment ops are excluded — their staged blobs are re-picked, never
 * re-hydrated into the form.
 */
export function seedDraftFromPending(
  tour: Tour,
  rows: { field: string; value: unknown }[],
): TourDraft {
  const draft: TourDraft = { ...tour };

  for (const { field, value } of rows) {
    const obj = (value ?? {}) as Record<string, unknown>;
    switch (field) {
      case 'name':
        draft.name = value as string | null;
        break;
      case 'dates':
        draft.plannedDate = obj.plannedDate ? new Date(String(obj.plannedDate)) : null;
        draft.endDate = obj.endDate ? new Date(String(obj.endDate)) : null;
        draft.startTime = (obj.startTime as string | undefined) ?? null;
        break;
      case 'grade':
        draft.grade = value as string | null;
        break;
      case 'tour_type': {
        // An object carries the legs (activity-legs D6); a plain list keeps them while they add up.
        const activities = value as ActivitiesValue | null;
        draft.tourTypes = Array.isArray(activities) ? activities : (activities?.types ?? []);
        if (!Array.isArray(activities) && activities)
          draft.legs =
            activities.ascent && activities.descent
              ? { ascent: activities.ascent, descent: activities.descent }
              : null;
        else if (draft.legs && !legsMatch(draft.tourTypes, draft.legs)) draft.legs = null;
        break;
      }
      case 'elevation':
        draft.elevation = value as number | null;
        break;
      case 'description':
        draft.description = value as string | null;
        break;
      case 'seasons':
        draft.seasons = value as TourDraft['seasons'];
        break;
      case 'equipment':
        draft.equipment = value as string | null;
        break;
      case 'notes':
        draft.notes = value as string | null;
        break;
      case 'start_point':
        draft.startPoint = value ? { lng: Number(obj.lng), lat: Number(obj.lat) } : null;
        draft.startPointName = (obj.name as string) ?? null;
        draft.startPointElevation = (obj.elevation as number) ?? null;
        break;
      case 'end_point':
        draft.endPoint = value ? { lng: Number(obj.lng), lat: Number(obj.lat) } : null;
        draft.endPointName = (obj.name as string) ?? null;
        draft.endPointElevation = (obj.elevation as number) ?? null;
        break;
      // `goal` is controlled by the map, not the draft — the host seeds it separately.
      default:
        break;
    }
  }

  return draft;
}

/** The suggested goal (and its derived elevation) from a pending `goal` row, if any. */
export function pendingGoalFrom(
  rows: { field: string; value: unknown }[],
): { lng: number; lat: number; elevation: number | null } | null {
  const row = rows.find((r) => r.field === 'goal');
  if (!row?.value) return null;
  const obj = row.value as Record<string, unknown>;
  return {
    lng: Number(obj.lng),
    lat: Number(obj.lat),
    elevation: obj.elevation == null ? null : Number(obj.elevation),
  };
}

/**
 * The binary ops (design D3), which cannot be derived from the draft alone: a staged blob
 * has to be uploaded before it has a `storagePath`, and a proposed removal names an
 * attachment the draft never carried. The host resolves both, then hands them here so
 * item construction still happens in ONE place.
 */
export interface SuggestionBinaryOps {
  /** Already uploaded to the suggester's staging prefix (D9). */
  addedAttachments?: {
    /**
     * Client-minted discriminator, carried as the item's `targetId`. The pending-row
     * uniqueness key is (tour, suggester, field, coalesce(target_id, zero-uuid)), so
     * several adds sharing a NULL target collapse onto ONE row — four of five picked
     * photos silently upserted over each other. Minted by the host, not here, so this
     * function stays pure.
     */
    id: string;
    storagePath: string;
    mimeType: string;
    sizeBytes: number;
    originalFilename: string;
  }[];
  /** Ids of the owner's existing `tour_attachments` rows proposed for removal. */
  removedAttachmentIds?: string[];
}

/**
 * Diff a friend's tour against what the partner submitted, producing one suggestion item
 * per CHANGED logical field (design D2). This is the whole client side of the suggest
 * flow: everything downstream (the RPC, the review sheet, the accept) consumes these
 * items, and the server re-derives `base_value` itself, so nothing here is trusted for
 * authorization — only for "what did they mean to change".
 *
 * Deliberately a pure function outside the SFC: `tour-form.vue` is already 1263 lines,
 * and this logic is the part worth testing on its own. It stays pure with the binary ops
 * too — it never sees a `File` and never touches the network.
 *
 * Two rules run through every branch:
 *  - An item's PRESENCE means "change this"; a null `value` means "change it to nothing".
 *    Unchanged fields emit nothing at all (D1).
 *  - Coupled columns emit as ONE item, so no partial accept can produce invalid data.
 */
export function buildSuggestionItems(
  original: Tour,
  draft: TourDraft,
  goal: { lng: number; lat: number },
  binary: SuggestionBinaryOps = {},
): SuggestionItem[] {
  const items: SuggestionItem[] = [];
  const push = (field: SuggestionField, value: unknown, targetId?: string) =>
    items.push(targetId ? { field, value, targetId } : { field, value });

  if (!textEqual(original.name, draft.name)) push('name', draft.name || null);

  // ONE item carrying both endpoints: accepting a new end_date against an unchanged
  // planned_date would trip `tours_end_date_after_start` on someone who did nothing wrong.
  // The start time rides along (it needs the date): named when set, `null` only to remove the
  // owner's time, absent otherwise — so accepting never wipes a time the suggester never saw.
  const startTime = draft.plannedDate ? (draft.startTime ?? null) : null;
  if (
    !datesEqual(original.plannedDate, draft.plannedDate) ||
    !datesEqual(original.endDate, draft.endDate) ||
    (original.startTime ?? null) !== startTime
  ) {
    push('dates', {
      plannedDate: toIsoDay(draft.plannedDate),
      endDate: toIsoDay(draft.endDate),
      ...(startTime || original.startTime ? { startTime } : {}),
    });
  }

  // The whole list is the value (both sides in canonical order): accepting replaces it. Legs on
  // either side make it an object — one without legs is how a suggestion unsplits a tour (D6).
  const legs = draft.legs === undefined ? (original.legs ?? null) : draft.legs;
  if (
    original.tourTypes.join() !== draft.tourTypes.join() ||
    JSON.stringify(original.legs ?? null) !== JSON.stringify(legs)
  )
    push(
      'tour_type',
      original.legs || legs ? { types: draft.tourTypes, ...legs } : draft.tourTypes,
    );

  // The goal and its elevation decide each other. A moved goal carries the freshly
  // looked-up elevation and suppresses the standalone field — otherwise "accept the new
  // summit, decline the new altitude" is a reachable tap sequence that produces wrong data
  // about a mountain. Elevation edited on its own is its own field.
  if (!pointsEqual(original.goal, goal))
    push('goal', { lng: goal.lng, lat: goal.lat, elevation: draft.elevation });
  else if (original.elevation !== draft.elevation) push('elevation', draft.elevation);

  // Name and elevation are DERIVED from the coordinates by the Swisstopo services, so they
  // travel with them: accepting a coordinate alone leaves a label describing the old place.
  // Editing only the name is still a change to the same logical field.
  if (
    !pointsEqual(original.startPoint, draft.startPoint) ||
    !textEqual(original.startPointName, draft.startPointName) ||
    original.startPointElevation !== draft.startPointElevation
  ) {
    push(
      'start_point',
      pointValue(draft.startPoint, draft.startPointName, draft.startPointElevation),
    );
  }

  if (
    !pointsEqual(original.endPoint, draft.endPoint) ||
    !textEqual(original.endPointName, draft.endPointName) ||
    original.endPointElevation !== draft.endPointElevation
  ) {
    push('end_point', pointValue(draft.endPoint, draft.endPointName, draft.endPointElevation));
  }

  if (!textEqual(original.description, draft.description))
    push('description', draft.description || null);

  const seasons = draft.seasons?.length ? draft.seasons : null;
  if (!seasonsEqual(original.seasons, seasons)) push('seasons', seasons);

  if (!textEqual(original.equipment, draft.equipment)) push('equipment', draft.equipment || null);

  if (!textEqual(original.notes, draft.notes)) push('notes', draft.notes || null);

  if (!textEqual(original.grade ?? null, draft.grade ?? null)) push('grade', draft.grade || null);

  // The form uploads a picked track at pick time, so by submit the draft already holds a
  // staging path — replace and remove are the same comparison, with null meaning "remove".
  if ((original.gpxFilepath ?? null) !== (draft.gpxFilepath ?? null))
    push('gpx', draft.gpxFilepath ? { storagePath: draft.gpxFilepath } : null);

  // An add and a remove are separate rows, so the owner may take the new photo without
  // losing the old one, and several adds can coexist and all be accepted.
  for (const { id, ...attachment } of binary.addedAttachments ?? [])
    push('attachment_add', attachment, id);

  for (const id of binary.removedAttachmentIds ?? []) push('attachment_remove', null, id);

  return items;
}

/** A point suggestion carries its derived name and elevation, or is null when cleared. */
function pointValue(
  point: { lng: number; lat: number } | null,
  name: string | null,
  elevation: number | null,
): unknown {
  return point ? { lng: point.lng, lat: point.lat, name: name || null, elevation } : null;
}

/** `date` columns are day-precision; the form already serializes this way. */
function toIsoDay(date: Date | null): string | null {
  return date ? date.toISOString().split('T')[0] : null;
}
