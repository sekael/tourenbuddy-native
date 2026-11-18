import type { Tour, TourDraft } from '@/features/tours/domain/entities/tour';

/** Abstract repository interface for tour data operations. */
export interface ToursRepository {
  listToursForUser: (userId: string) => Promise<Tour[]>;
  /** Friend tours readable by the current user (gated for non-partner viewers). */
  listFriendTours: () => Promise<Tour[]>;
  createTourWithPartners: (
    id: string,
    draft: TourDraft,
    goal: { lng: number; lat: number },
  ) => Promise<void>;
  /** Returns false when no row was updated (tour gone) — update-only, never resurrects. */
  updateTour: (
    id: string,
    draft: TourDraft,
    goal: { lng: number; lat: number },
  ) => Promise<boolean>;
  deleteTour: (id: string) => Promise<void>;
  /** Current server `updated_at` for a tour, or null if the row is gone — the LWW read (DC5). */
  getUpdatedAt: (id: string) => Promise<string | null>;
}
