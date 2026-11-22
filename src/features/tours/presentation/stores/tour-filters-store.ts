import { create } from 'zustand';

import { resolveContactName, type Contact } from '@/features/contacts/domain/entities/contact';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { gradeSelected } from '@/features/tours/data/models/grade';
import type { Season } from '@/features/tours/data/models/season';
import type { TourType } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingKey, outingSegments } from '@/features/tours/domain/outing';

/**
 * The tours list's search and filters (tour-list-view), ported from the PWA's `use-tour-filters`:
 * one state per tab, so My Tours and Friends never bleed into each other, kept while the sheet
 * closes and reopens. Which tab shows is the opener's choice: "Meine Touren" opens mine, a
 * friend's Touren opens Friends.
 */
export type CompletionFilter = 'all' | 'done' | 'open';
export type TourTab = 'owned' | 'friends';

export type TourFilters = {
  /** My Tours only: partner contact ids. Friends filter by who recorded the tour instead. */
  partnerIds: Set<string>;
  /** Friends only: the friends who recorded the tour. */
  ownerIds: Set<string>;
  tourTypes: Set<TourType>;
  /** Closed-scale grades, additive: a tour on any of them passes. */
  grades: Set<string>;
  seasons: Set<Season>;
  dateFrom: Date | null;
  dateTo: Date | null;
  completion: CompletionFilter;
};

type TabState = { query: string; filters: TourFilters };

const emptyFilters = (): TourFilters => ({
  partnerIds: new Set(),
  ownerIds: new Set(),
  tourTypes: new Set(),
  grades: new Set(),
  seasons: new Set(),
  dateFrom: null,
  dateTo: null,
  completion: 'all',
});

type FiltersState = {
  tab: TourTab;
  owned: TabState;
  friends: TabState;
  setTab: (tab: TourTab) => void;
  setQuery: (tab: TourTab, query: string) => void;
  setFilters: (tab: TourTab, patch: Partial<TourFilters>) => void;
  clearFilters: (tab: TourTab) => void;
  clearAll: (tab: TourTab) => void;
  /** Clears search and filters on both tabs; the tab is kept. */
  reset: () => void;
  /** A friend's tours on their own (from the contact detail): Friends tab, that friend only. */
  showFriendTours: (userId: string) => void;
};

export const useTourFiltersStore = create<FiltersState>()((set) => ({
  tab: 'owned',
  owned: { query: '', filters: emptyFilters() },
  friends: { query: '', filters: emptyFilters() },
  setTab: (tab) => set({ tab }),
  setQuery: (tab, query) => set((s) => ({ [tab]: { ...s[tab], query } })),
  setFilters: (tab, patch) =>
    set((s) => ({ [tab]: { ...s[tab], filters: { ...s[tab].filters, ...patch } } })),
  clearFilters: (tab) => set((s) => ({ [tab]: { ...s[tab], filters: emptyFilters() } })),
  clearAll: (tab) => set({ [tab]: { query: '', filters: emptyFilters() } }),
  reset: () =>
    set({
      owned: { query: '', filters: emptyFilters() },
      friends: { query: '', filters: emptyFilters() },
    }),
  showFriendTours: (userId) => {
    set({
      tab: 'friends',
      owned: { query: '', filters: emptyFilters() },
      friends: { query: '', filters: { ...emptyFilters(), ownerIds: new Set([userId]) } },
    });
  },
}));

export function activeFilterCount(filters: TourFilters): number {
  return [
    filters.partnerIds.size > 0,
    filters.ownerIds.size > 0,
    filters.tourTypes.size > 0,
    filters.grades.size > 0,
    filters.seasons.size > 0,
    filters.dateFrom !== null || filters.dateTo !== null,
    filters.completion !== 'all',
  ].filter(Boolean).length;
}

export type NameLookup = {
  contacts: Contact[];
  phoneMap: Map<string, string>;
  findContactByPhone: (phone: string) => Contact | undefined;
};

/** Partner names as the rows and the detail show them, so search never disagrees with display. */
function partnerNames(tour: Tour, names: NameLookup): string[] {
  if (tour.isFriendTour) {
    return (tour.partnerNames ?? []).map(
      (p) =>
        resolveFriendName(p.userId, names.phoneMap, names.findContactByPhone) ??
        [p.firstName, p.lastName].filter(Boolean).join(' '),
    );
  }
  return tour.partnerIds.map((id) => {
    const contact = names.contacts.find((c) => c.id === id);
    return contact ? resolveContactName(contact) : '';
  });
}

function matchesSearch(tour: Tour, query: string, names: NameLookup): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (tour.name?.toLowerCase().includes(q)) return true;
  // The row shows the grade, so "T4" or "zs" finds it.
  if (tour.grade?.toLowerCase().includes(q)) return true;
  // A segment surfaces its outing's row, so the outing's name finds it too.
  if (tour.outing?.name?.toLowerCase().includes(q)) return true;
  // Friend rows say "by <contact name>": that name is searchable, from the same resolver.
  if (tour.isFriendTour) {
    const owner = resolveFriendName(tour.userId, names.phoneMap, names.findContactByPhone);
    if (owner?.toLowerCase().includes(q)) return true;
  }
  return partnerNames(tour, names).some((name) => name.toLowerCase().includes(q));
}

function matchesFilters(tour: Tour, f: TourFilters): boolean {
  if (f.partnerIds.size > 0 && !tour.partnerIds.some((id) => f.partnerIds.has(id))) return false;
  if (f.ownerIds.size > 0 && !f.ownerIds.has(tour.userId)) return false;
  // Any of the tour's activities may match.
  if (f.tourTypes.size > 0 && !tour.tourTypes.some((t) => f.tourTypes.has(t))) return false;
  if (f.grades.size > 0 && !gradeSelected(tour.grade, f.grades)) return false;
  if (f.seasons.size > 0 && !tour.seasons?.some((s) => f.seasons.has(s))) return false;
  // Span overlap, not start containment: "next week" finds a tour that started the Friday before.
  if (f.dateFrom || f.dateTo) {
    if (!tour.plannedDate) return false;
    const end = tour.endDate ?? tour.plannedDate;
    if (f.dateFrom && end < f.dateFrom) return false;
    if (f.dateTo && tour.plannedDate > f.dateTo) return false;
  }
  if (f.completion === 'done' && !tour.completed) return false;
  if (f.completion === 'open' && tour.completed) return false;
  return true;
}

export function filterTours(tours: Tour[], tab: TabState, names: NameLookup): Tour[] {
  return tours.filter((t) => matchesSearch(t, tab.query, names) && matchesFilters(t, tab.filters));
}

export type ListEntry =
  { kind: 'tour'; tour: Tour } | { kind: 'outing'; key: string; segments: Tour[] };

/**
 * Rows after search and filters: an outing's segments fold into one row, placed where its first
 * matching segment was, listing all its segments.
 */
export function listEntries(filtered: Tour[], source: Tour[]): ListEntry[] {
  const seen = new Set<string>();
  const entries: ListEntry[] = [];
  for (const tour of filtered) {
    const key = outingKey(tour);
    const segments = outingSegments(source, key);
    if (segments.length === 0) entries.push({ kind: 'tour', tour });
    else if (!seen.has(key!)) {
      seen.add(key!);
      entries.push({ kind: 'outing', key: key!, segments });
    }
  }
  return entries;
}

/**
 * The ids the active tab lists while search or filters narrow it, for the map; null when nothing
 * narrows. A listed outing row stands for all its segments.
 */
export function listedTourIds(filtered: Tour[], source: Tour[], tab: TabState): Set<string> | null {
  if (!tab.query.trim() && activeFilterCount(tab.filters) === 0) return null;
  const ids = new Set<string>();
  for (const tour of filtered) {
    ids.add(tour.id);
    for (const segment of outingSegments(source, outingKey(tour))) ids.add(segment.id);
  }
  return ids;
}
