import { useEffect } from 'react';

import { useAvailabilityStore } from '@/features/calendar/presentation/stores/availability-store';
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';
import { useInboxStore } from '@/features/notifications/presentation/stores/inbox-store';
import { useNotificationsStore } from '@/features/notifications/presentation/stores/notifications-store';
import { useTourReturn } from '@/features/onboarding/presentation/tour-return';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';
import { useTourDraftStore } from '@/features/tours/presentation/stores/tour-draft-store';
import { useTourFiltersStore } from '@/features/tours/presentation/stores/tour-filters-store';
import { useTourSuggestionsStore } from '@/features/tours/presentation/stores/tour-suggestions-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

/**
 * Every signed-in store, started once a user is known and cleared when they sign out or another
 * user signs in, before that user's data loads (D3: the root layout composes the features, as the
 * PWA's `setupAuthRedirect` did). Shared by the native and the web root layouts.
 */
const sessionStores = [
  useUserProfileStore,
  useContactsStore,
  useFriendshipsStore,
  useUserBlocksStore,
  useToursStore,
  useTourSuggestionsStore,
  useTourLinksStore,
  useAvailabilityStore,
  useNotificationsStore,
  useInboxStore,
];

export function useSessionStores(userId: string | null) {
  useEffect(() => {
    if (!userId) return;
    sessionStores.forEach((store) => store.getState().start());
    return () => {
      sessionStores.forEach((store) => store.getState().clear());
      useTourAttachmentsStore.getState().clear();
      useCalendarFeedStore.getState().clear();
      useTourDraftStore.getState().reset();
      useTourFiltersStore.getState().reset();
      useTourReturn.setState({ start: null });
    };
  }, [userId]);
}
