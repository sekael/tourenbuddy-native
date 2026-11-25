import { useMemo } from 'react';

import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import {
  activeFilterCount,
  filterTours,
  listedTourIds,
  useTourFiltersStore,
  type NameLookup,
  type TourFilters,
  type TourTab,
} from '@/features/tours/presentation/stores/tour-filters-store';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

export type {
  CompletionFilter,
  TourFilters,
  TourTab,
} from '@/features/tours/presentation/stores/tour-filters-store';

// The PWA's key: the tab last viewed survives reloads (and the switch from the PWA).
const ACTIVE_TAB_STORAGE_KEY = 'tours.list.activeTab';
try {
  const stored = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  if (stored === 'owned' || stored === 'friends') useTourFiltersStore.setState({ tab: stored });
} catch {
  // localStorage unavailable: the list opens on My tours.
}
useTourFiltersStore.subscribe((s, prev) => {
  if (s.tab === prev.tab) return;
  try {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, s.tab);
  } catch {
    // Not persisted this time.
  }
});

/** Clears search and filters on every tab (leaving the list); the active tab is kept. */
export const resetTourFilters = () => useTourFiltersStore.getState().reset();

/** A friend's tours on their own (from the contact detail): Friends tab, that friend only. */
export const showFriendTours = (userId: string) =>
  useTourFiltersStore.getState().showFriendTours(userId);

export function useActiveTourTab(): [TourTab, (tab: TourTab) => void] {
  return [useTourFiltersStore((s) => s.tab), useTourFiltersStore((s) => s.setTab)];
}

function useNames(): NameLookup {
  const contacts = useContactsStore((s) => s.contacts);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  return useMemo(
    () => ({
      contacts,
      phoneMap,
      findContactByPhone: (phone: string) =>
        useContactsStore.getState().findContactByMethodValue('phone', phone) ?? undefined,
    }),
    [contacts, phoneMap],
  );
}

/** The PWA's `useTourFilters(tab)`: that tab's search, filters and the tours they leave. */
export function useTourFilters(tab: TourTab = 'owned') {
  const state = useTourFiltersStore((s) => s[tab]);
  const source = useToursStore((s) => (tab === 'friends' ? s.friendTours : s.tours));
  const names = useNames();
  const filteredTours = useMemo(() => filterTours(source, state, names), [source, state, names]);
  const store = useTourFiltersStore.getState();
  return {
    searchQuery: state.query,
    setSearchQuery: (query: string) => store.setQuery(tab, query),
    filters: state.filters,
    setFilters: (patch: Partial<TourFilters>) => store.setFilters(tab, patch),
    filteredTours,
    activeFilterCount: activeFilterCount(state.filters),
    clearFilters: () => store.clearFilters(tab),
    clearAll: () => store.clearAll(tab),
  };
}

/**
 * The ids the active tab lists while its search or filters narrow it, for the map; null when
 * nothing narrows. A listed outing row stands for all its segments.
 */
export function useListedTourIds(): Set<string> | null {
  const tab = useTourFiltersStore((s) => s.tab);
  const state = useTourFiltersStore((s) => s[s.tab]);
  const source = useToursStore((s) => (tab === 'friends' ? s.friendTours : s.tours));
  const names = useNames();
  return useMemo(
    () => listedTourIds(filterTours(source, state, names), source, state),
    [source, state, names],
  );
}
