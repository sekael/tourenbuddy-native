import type {
  BackfillCollisionPair,
  TourLinkMember,
  TourLinkRequest,
} from '@/features/tour-links/domain/entities/tour-link';

/**
 * Repository for tour link groups + handshake requests.
 *
 * Mutations are server-only (SECURITY DEFINER RPCs); the client never writes
 * directly. Reads come through RLS-scoped SELECTs.
 */
export interface TourLinksRepository {
  /** All link-member rows whose groups contain any of `tourIds`. */
  listGroupsForTours: (tourIds: string[]) => Promise<TourLinkMember[]>;

  /**
   * Group ids of friend tours the caller cannot otherwise see via RLS.
   * Returns `(tourId, groupId)` only for tours that ARE in a group.
   */
  listFriendTourGroupIds: (tourIds: string[]) => Promise<{ tourId: string; groupId: string }[]>;

  /** All pending requests touching any of `tourIds` (either side). */
  listPendingRequestsForTours: (tourIds: string[]) => Promise<TourLinkRequest[]>;

  /** Initiate a link request. Resolves to the new request id. */
  createRequest: (initiatorTourId: string, targetTourId: string) => Promise<string>;

  /** Accept a pending request — resolves to `{groupId, addedTourIds}`. */
  acceptRequest: (requestId: string) => Promise<{ groupId: string; addedTourIds: string[] }>;

  /** Decline a pending request. */
  declineRequest: (requestId: string) => Promise<void>;

  /** Withdraw a pending request the caller initiated. */
  withdrawRequest: (requestId: string) => Promise<void>;

  /** Not-yet-linked, no-pending-request friend collisions for a friendship. */
  listBackfillCollisionsForFriendship: (friendshipId: string) => Promise<BackfillCollisionPair[]>;

  /** Not-yet-linked, no-pending-request friend collisions across all friendships. */
  listAllBackfillCollisions: () => Promise<BackfillCollisionPair[]>;
}
