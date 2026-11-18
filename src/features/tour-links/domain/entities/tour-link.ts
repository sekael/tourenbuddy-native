export type {
  TourLinkGroup,
  TourLinkMember,
  TourLinkRequest,
  TourLinkRequestStatus,
} from '@/features/tour-links/data/models/tour-link-schemas';

/**
 * A pair of (your tour, friend's tour) returned by the backfill-collisions scan.
 * Used by the page opened from the friendship-accept digest notification.
 */
export interface BackfillCollisionPair {
  yourTourId: string;
  yourTourName: string | null;
  friendTourId: string;
  friendTourName: string | null;
  friendUserId: string;
  /** Present only for all-friendships scans; undefined for per-friendship scans. */
  friendshipId?: string;
}
