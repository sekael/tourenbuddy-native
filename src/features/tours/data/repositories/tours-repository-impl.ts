import type { TourOuting } from '@/features/tours/data/models/tour-schema';
import type { Tour, TourDraft } from '@/features/tours/domain/entities/tour';
import type { ToursRepository } from '@/features/tours/domain/repositories/tours-repository';
import { supabase } from '@/core/supabase';
import { friendTourRowSchema, tourRowSchema } from '@/features/tours/data/models/tour-schema';

/** `p_outing` (design D12): null keeps the membership, `{}` = standalone, object = segment. */
function outingParam(outing: TourOuting | null | undefined) {
  if (outing === undefined) return null;
  return outing ? { id: outing.id, name: outing.name, position: outing.position } : {};
}

/** `p_grade` / `p_start_time` (design D5): undefined keeps (null), null clears (''), else set. */
function keepOrClear(value: string | null | undefined) {
  return value === undefined ? null : (value ?? '');
}

/** `p_ascent_types` / `p_descent_types` (activity-legs D2): undefined keeps (null), null clears ({}). */
function legParam(legs: TourDraft['legs'], leg: 'ascent' | 'descent') {
  return legs === undefined ? null : (legs?.[leg] ?? []);
}

export class ToursRepositoryImpl implements ToursRepository {
  async listToursForUser(userId: string): Promise<Tour[]> {
    const { data, error } = await supabase.from('tours_view').select('*').eq('user_id', userId);

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => tourRowSchema.parse(row));
  }

  async listFriendTours(): Promise<Tour[]> {
    // RLS + the security_invoker view scope rows to friends' friends-visible tours.
    const { data, error } = await supabase.from('friend_tours_view').select('*');

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => friendTourRowSchema.parse(row));
  }

  async createTourWithPartners(
    id: string,
    draft: TourDraft,
    goal: { lng: number; lat: number },
  ): Promise<void> {
    const { error } = await supabase.rpc('create_tour_full', {
      p_id: id,
      p_planned_date: draft.plannedDate?.toISOString().split('T')[0] ?? null,
      p_name: draft.name ?? null,
      p_goal: `POINT(${goal.lng} ${goal.lat})`,
      p_partner_ids: draft.partnerIds,
      p_tour_types: draft.tourTypes,
      p_elevation: draft.elevation ?? null,
      p_gpx_filepath: draft.gpxFilepath ?? null,
      p_description: draft.description ?? null,
      p_seasons: draft.seasons ?? null,
      p_start_point: draft.startPoint
        ? `POINT(${draft.startPoint.lng} ${draft.startPoint.lat})`
        : null,
      p_end_point: draft.endPoint ? `POINT(${draft.endPoint.lng} ${draft.endPoint.lat})` : null,
      p_start_point_name: draft.startPointName ?? null,
      p_start_point_elevation: draft.startPointElevation ?? null,
      p_end_point_name: draft.endPointName ?? null,
      p_end_point_elevation: draft.endPointElevation ?? null,
      p_equipment: draft.equipment ?? null,
      p_notes: draft.notes ?? null,
      p_visibility: draft.visibility ?? null,
      p_completed: draft.completed ?? null,
      p_end_date: draft.endDate?.toISOString().split('T')[0] ?? null,
      p_outing: outingParam(draft.outing),
      p_grade: keepOrClear(draft.grade),
      p_start_time: keepOrClear(draft.startTime),
      p_ascent_types: legParam(draft.legs, 'ascent'),
      p_descent_types: legParam(draft.legs, 'descent'),
    });

    if (error) throw new Error(error.message);
  }

  async updateTour(
    id: string,
    draft: TourDraft,
    goal: { lng: number; lat: number },
  ): Promise<boolean> {
    const { data, error } = await supabase.rpc('update_tour_full', {
      p_id: id,
      p_planned_date: draft.plannedDate?.toISOString().split('T')[0] ?? null,
      p_name: draft.name ?? null,
      p_goal: `POINT(${goal.lng} ${goal.lat})`,
      p_partner_ids: draft.partnerIds,
      p_tour_types: draft.tourTypes,
      p_elevation: draft.elevation ?? null,
      p_gpx_filepath: draft.gpxFilepath ?? null,
      p_description: draft.description ?? null,
      p_seasons: draft.seasons ?? null,
      p_start_point: draft.startPoint
        ? `POINT(${draft.startPoint.lng} ${draft.startPoint.lat})`
        : null,
      p_end_point: draft.endPoint ? `POINT(${draft.endPoint.lng} ${draft.endPoint.lat})` : null,
      p_start_point_name: draft.startPointName ?? null,
      p_start_point_elevation: draft.startPointElevation ?? null,
      p_end_point_name: draft.endPointName ?? null,
      p_end_point_elevation: draft.endPointElevation ?? null,
      p_equipment: draft.equipment ?? null,
      p_notes: draft.notes ?? null,
      p_visibility: draft.visibility ?? null,
      p_completed: draft.completed ?? null,
      p_end_date: draft.endDate?.toISOString().split('T')[0] ?? null,
      p_outing: outingParam(draft.outing),
      p_grade: keepOrClear(draft.grade),
      p_start_time: keepOrClear(draft.startTime),
      p_ascent_types: legParam(draft.legs, 'ascent'),
      p_descent_types: legParam(draft.legs, 'descent'),
    });

    if (error) throw new Error(error.message);

    // update_tour_full returns false when the row is gone (update-only, no resurrect).
    return data === true;
  }

  async deleteTour(id: string): Promise<void> {
    const { error } = await supabase.from('tours').delete().eq('id', id);

    if (error) throw new Error(error.message);
  }

  async getUpdatedAt(id: string): Promise<string | null> {
    // maybeSingle → null (not an error) when the row is gone; RLS scopes to the owner.
    const { data, error } = await supabase
      .from('tours')
      .select('updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return data?.updated_at ?? null;
  }
}
