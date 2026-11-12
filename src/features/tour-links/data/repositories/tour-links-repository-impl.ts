import type {
  BackfillCollisionPair,
  TourLinkMember,
  TourLinkRequest,
} from '@/features/tour-links/domain/entities/tour-link';
import type { TourLinksRepository } from '@/features/tour-links/domain/repositories/tour-links-repository';
import { supabase } from '@/core/supabase';
import {
  tourLinkMemberRowSchema,
  tourLinkRequestRowSchema,
} from '@/features/tour-links/data/models/tour-link-schemas';

export class TourLinksRepositoryImpl implements TourLinksRepository {
  async listGroupsForTours(tourIds: string[]): Promise<TourLinkMember[]> {
    if (tourIds.length === 0) return [];

    // First pass: find the group_ids these tours belong to.
    const { data: own, error: ownErr } = await supabase
      .from('tour_link_member')
      .select('group_id, tour_id, joined_at')
      .in('tour_id', tourIds);

    if (ownErr) throw new Error(ownErr.message);
    const groupIds = Array.from(new Set((own ?? []).map((r) => r.group_id)));
    if (groupIds.length === 0) return [];

    // Second pass: every member of those groups (so siblings are included).
    const { data, error } = await supabase
      .from('tour_link_member')
      .select('group_id, tour_id, joined_at')
      .in('group_id', groupIds);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => tourLinkMemberRowSchema.parse(row));
  }

  async listFriendTourGroupIds(tourIds: string[]): Promise<{ tourId: string; groupId: string }[]> {
    if (tourIds.length === 0) return [];
    const { data, error } = await supabase.rpc('fn_friend_tour_group_ids', {
      p_tour_ids: tourIds,
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row: { tour_id: string; group_id: string }) => ({
      tourId: row.tour_id,
      groupId: row.group_id,
    }));
  }

  async listPendingRequestsForTours(tourIds: string[]): Promise<TourLinkRequest[]> {
    if (tourIds.length === 0) return [];
    const ids = tourIds.map((id) => `"${id}"`).join(',');
    const { data, error } = await supabase
      .from('tour_link_request')
      .select('id, initiator_tour_id, target_tour_id, status, created_at, resolved_at')
      .eq('status', 'pending')
      .or(`initiator_tour_id.in.(${ids}),target_tour_id.in.(${ids})`);

    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => tourLinkRequestRowSchema.parse(row));
  }

  async createRequest(initiatorTourId: string, targetTourId: string): Promise<string> {
    const { data, error } = await supabase.rpc('create_link_request', {
      p_initiator_tour_id: initiatorTourId,
      p_target_tour_id: targetTourId,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async acceptRequest(requestId: string): Promise<{ groupId: string; addedTourIds: string[] }> {
    const { data, error } = await supabase.rpc('accept_link_request', { p_request_id: requestId });
    if (error) throw new Error(error.message);
    const result = data as { group_id: string; added_tour_ids: string[] };
    return { groupId: result.group_id, addedTourIds: result.added_tour_ids ?? [] };
  }

  async declineRequest(requestId: string): Promise<void> {
    const { error } = await supabase.rpc('decline_link_request', { p_request_id: requestId });
    if (error) throw new Error(error.message);
  }

  async withdrawRequest(requestId: string): Promise<void> {
    const { error } = await supabase.rpc('withdraw_link_request', { p_request_id: requestId });
    if (error) throw new Error(error.message);
  }

  async listBackfillCollisionsForFriendship(
    friendshipId: string,
  ): Promise<BackfillCollisionPair[]> {
    const { data, error } = await supabase.rpc('list_backfill_pairs_for_friendship', {
      p_friendship_id: friendshipId,
    });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
      your_tour_id: string;
      your_tour_name: string | null;
      friend_tour_id: string;
      friend_tour_name: string | null;
      friend_user_id: string;
    }[];
    return rows.map((r) => ({
      yourTourId: r.your_tour_id,
      yourTourName: r.your_tour_name,
      friendTourId: r.friend_tour_id,
      friendTourName: r.friend_tour_name,
      friendUserId: r.friend_user_id,
    }));
  }

  async listAllBackfillCollisions(): Promise<BackfillCollisionPair[]> {
    const { data, error } = await supabase.rpc('list_all_backfill_pairs');
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as {
      your_tour_id: string;
      your_tour_name: string | null;
      friend_tour_id: string;
      friend_tour_name: string | null;
      friend_user_id: string;
      friendship_id: string;
    }[];
    return rows.map((r) => ({
      yourTourId: r.your_tour_id,
      yourTourName: r.your_tour_name,
      friendTourId: r.friend_tour_id,
      friendTourName: r.friend_tour_name,
      friendUserId: r.friend_user_id,
      friendshipId: r.friendship_id,
    }));
  }
}
