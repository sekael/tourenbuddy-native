import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import {
  DateRow,
  EmptyState,
  ListRow,
  ListSection,
  PickerRow,
  type RowAction,
} from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import {
  FILTER_GRADE_SCALES,
  GRADE_SCALES,
  gradeLeads,
  gradeScaleOf,
} from '@/features/tours/data/models/grade';
import { SEASON_VALUES, type Season } from '@/features/tours/data/models/season';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  TOUR_TYPE_ICONS,
  TOUR_TYPE_VALUES,
  type TourType,
} from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';

import { shareTourGpx } from './share-gpx';
import {
  activeFilterCount,
  filterTours,
  listEntries,
  useTourFiltersStore,
  type CompletionFilter,
  type TourFilters,
  type TourTab,
} from './stores/tour-filters-store';
import { useTourSuggestionsStore } from './stores/tour-suggestions-store';
import { useToursStore } from './stores/tours-store';
import { OutingPage } from './outing-page';
import { TourDetailPage } from './tour-detail-page';
import { OutingRow, TourRow } from './tour-rows';
import type { IconName } from '@/core/adaptive/icons';

/**
 * The tours sheet over the map (tour-list-view): My Tours | Friends in the bar, search, filters
 * as a pushed page, and a tour's detail pushed in the same sheet, so Back returns to the list
 * with its tab, search and filters as they were.
 */
export function ToursSheet() {
  const [path, setPath] = useState<string[]>([]);
  // Opened from "Meine Touren", it shows mine; a friend's tours open on Friends (each tab keeps
  // its filters).
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  useState(() => {
    if (tab !== 'friends') useTourFiltersStore.getState().setTab('owned');
  });
  const push = (value: string) => setPath((p) => [...p, value]);

  return (
    <Screen
      path={path}
      onPathChange={setPath}
      renderPage={(value) => {
        if (value === 'filters')
          return <TourFiltersPage onDone={() => setPath((p) => p.slice(0, -1))} />;
        if (value.startsWith('tour:'))
          return (
            <TourDetailPage
              id={value.slice(5)}
              onGone={() => setPath((p) => p.slice(0, -1))}
              onOpenOuting={(key) => push(`outing:${key}`)}
              onOpenTour={(id) => push(`tour:${id}`)}
            />
          );
        if (value.startsWith('outing:'))
          return <OutingPage outingKey={value.slice(7)} onOpenTour={(id) => push(`tour:${id}`)} />;
        return null;
      }}
    >
      <ToursListPage onPush={push} />
    </Screen>
  );
}

function useNames() {
  const contacts = useContactsStore((s) => s.contacts);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  return useMemo(
    () => ({
      contacts,
      phoneMap,
      findContactByPhone: (phone: string) =>
        useContactsStore.getState().findContactByMethodValue('phone', phone),
    }),
    [contacts, phoneMap],
  );
}

function ToursListPage({ onPush }: { onPush: (value: string) => void }) {
  const { t } = useTranslation();
  const tab = useTourFiltersStore((s) => s.tab);
  const tabState = useTourFiltersStore((s) => s[s.tab]);
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const isLoading = useToursStore((s) => s.isLoading);
  const pending = useTourSuggestionsStore((s) => s.pendingCountByTour);
  const hasFriends = useFriendshipsStore((s) => s.friendships.length > 0);
  const names = useNames();

  const source = tab === 'friends' ? friendTours : tours;
  const filtered = useMemo(() => filterTours(source, tabState, names), [source, tabState, names]);
  const entries = useMemo(() => listEntries(filtered, source), [filtered, source]);
  const filterCount = activeFilterCount(tabState.filters);

  // Friends' tours refetch when their tab opens.
  useEffect(() => {
    if (tab === 'friends') void useToursStore.getState().loadFriendTours();
  }, [tab]);

  const store = useTourFiltersStore.getState();

  function rowActions(tour: Tour): {
    leading?: RowAction[];
    trailing?: RowAction[];
    context: RowAction[];
  } {
    const open = {
      label: t('tours.list.open'),
      icon: 'info' as const,
      onPress: () => onPush(`tour:${tour.id}`),
    };
    const share: RowAction[] = tour.gpxFilepath
      ? [
          {
            label: t('tours.infoSheet.downloadGpxBtn'),
            icon: 'download',
            onPress: () => void shareTourGpx(tour),
          },
        ]
      : [];
    if (tour.isFriendTour) return { context: [open, ...share] };
    const complete: RowAction = {
      label: tour.completed ? t('tours.list.markOpen') : t('tours.infoSheet.completeTourBtn'),
      icon: 'check_circle',
      onPress: () => {
        void useToursStore.getState().setCompleted(tour.id, !tour.completed);
        if (!tour.completed)
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      },
    };
    const remove: RowAction = {
      label: t('tours.infoSheet.deleteBtn'),
      icon: 'delete',
      destructive: true,
      onPress: () => confirmDeleteTour(t, tour.id),
    };
    return { leading: [complete], trailing: [remove], context: [open, complete, ...share, remove] };
  }

  const empty =
    tab === 'owned' && isLoading && tours.length === 0 ? (
      <ListSection>
        <ListRow title={t('tours.list.loading')} />
      </ListSection>
    ) : source.length === 0 ? (
      <EmptyState
        icon={tab === 'friends' ? 'group' : 'location_on'}
        title={tab === 'friends' ? t('tours.list.friendsEmptyTitle') : t('tours.list.emptyTitle')}
        description={
          tab === 'friends' ? t('tours.list.friendsEmptySubtitle') : t('tours.list.emptySubtitle')
        }
        actionLabel={tab === 'owned' ? t('tours.list.addTourAriaLabel') : undefined}
        onAction={tab === 'owned' ? () => router.replace('/plan') : undefined}
      />
    ) : filtered.length === 0 ? (
      <EmptyState
        icon="search_off"
        title={t('tours.list.noMatchesTitle')}
        actionLabel={t('tours.list.clearFiltersBtn')}
        onAction={() => store.clearAll(tab)}
      />
    ) : null;

  return (
    <Page
      title={t('tours.list.title')}
      titleControl={{
        value: tab,
        options: [
          { value: 'owned', label: t('tours.list.tabOwned') },
          { value: 'friends', label: t('tours.list.tabFriends') },
        ],
        onChange: (value) => store.setTab(value as TourTab),
      }}
      search={{
        value: tabState.query,
        onChange: (q) => store.setQuery(tab, q),
        prompt: t('tours.list.searchPlaceholder'),
      }}
      onClose={() => router.back()}
      actions={[
        {
          id: 'filters',
          label:
            filterCount > 0
              ? t('tours.list.filtersActive', { count: filterCount })
              : t('tours.list.filtersBtn'),
          icon: filterCount > 0 ? 'tune' : 'tune',
          onPress: () => onPush('filters'),
        },
        ...(tab === 'friends' && hasFriends
          ? [
              {
                id: 'backfill',
                label: t('tours.list.viewBackfillCollisionsBtn'),
                icon: 'sync_alt' as const,
                onPress: () => router.push('/tour-overlaps'),
              },
            ]
          : [
              {
                id: 'add',
                label: t('tours.list.addTourAriaLabel'),
                icon: 'add_location_alt' as const,
                onPress: () => router.replace('/plan'),
              },
            ]),
      ]}
      onRefresh={() =>
        tab === 'friends'
          ? useToursStore.getState().loadFriendTours()
          : useToursStore.getState().loadTours()
      }
    >
      {empty ?? (
        <ListSection
          footer={
            filterCount > 0 ? t('tours.list.filteredFooter', { count: filtered.length }) : undefined
          }
        >
          {entries.map((entry) => {
            if (entry.kind === 'outing') {
              return (
                <OutingRow
                  key={entry.key}
                  segments={entry.segments}
                  onPress={() => onPush(`outing:${entry.key}`)}
                />
              );
            }
            const actions = rowActions(entry.tour);
            return (
              <TourRow
                key={entry.tour.id}
                tour={entry.tour}
                pendingSuggestions={entry.tour.isFriendTour ? 0 : (pending[entry.tour.id] ?? 0)}
                onPress={() => onPush(`tour:${entry.tour.id}`)}
                leadingSwipeActions={actions.leading}
                swipeActions={actions.trailing}
                contextActions={actions.context}
              />
            );
          })}
        </ListSection>
      )}
    </Page>
  );
}

/** Asks before a tour is deleted (tour-list-view, tour detail): the delete cannot be undone. */
export function confirmDeleteTour(t: TFunction, id: string, onDeleted?: () => void) {
  Alert.alert(t('tours.infoSheet.deleteConfirmText'), t('tours.infoSheet.deleteConfirmDetail'), [
    { text: t('tours.infoSheet.cancelBtn'), style: 'cancel' },
    {
      text: t('tours.infoSheet.deleteBtn'),
      style: 'destructive',
      onPress: () => {
        void useToursStore
          .getState()
          .deleteTour(id)
          .then(() => onDeleted?.())
          .catch(() => Alert.alert(t('tours.infoSheet.deleteFailed')));
      },
    },
  ]);
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (!next.delete(value)) next.add(value);
  return next;
}

/** The filters as a pushed page: checkmark lists per group, dates, status; Reset in the bar. */
function TourFiltersPage({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const tab = useTourFiltersStore((s) => s.tab);
  const tabState = useTourFiltersStore((s) => s[s.tab]);
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const contacts = useContactsStore((s) => s.contacts);
  const names = useNames();
  const f = tabState.filters;
  const set = (patch: Partial<TourFilters>) => {
    useTourFiltersStore.getState().setFilters(tab, patch);
    void Haptics.selectionAsync();
  };
  const source = tab === 'friends' ? friendTours : tours;
  const resultCount = filterTours(source, tabState, names).length;

  const owners = useMemo(() => {
    const ids = [...new Set(friendTours.map((tour) => tour.userId))];
    return ids
      .map((id) => ({
        id,
        label:
          resolveFriendName(id, names.phoneMap, names.findContactByPhone) ??
          t('tours.list.aFriend'),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [friendTours, names, t]);

  // Offered from the tab's tours only (never from the results), so rows never jump while tapped.
  const scales = useMemo(() => {
    const inUse = new Set(
      source.flatMap((tour) => (tour.grade ? gradeLeads(tour.grade) : [])).map(gradeScaleOf),
    );
    return FILTER_GRADE_SCALES.filter(
      (s) => inUse.has(s.grades) || s.grades.some((g) => f.grades.has(g)),
    ).map((s) => ({
      ...s,
      activities: TOUR_TYPE_VALUES.filter((type) => GRADE_SCALES[type] === s.grades)
        .map((type) => t(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}` as 'tours.type.hiking'))
        .join(', '),
    }));
  }, [source, f.grades, t]);

  return (
    <Page
      title={t('tours.list.filtersBtn')}
      actions={[
        {
          id: 'reset',
          label: t('tours.filters.resetBtn'),
          icon: 'replay',
          disabled: activeFilterCount(f) === 0,
          onPress: () => useTourFiltersStore.getState().clearFilters(tab),
        },
      ]}
      confirm={{
        label: t('tours.filters.showResultsBtn', { count: resultCount }),
        onPress: onDone,
      }}
    >
      <ListSection title={t('tours.filters.statusLabel')}>
        <PickerRow<CompletionFilter>
          title={t('tours.filters.statusLabel')}
          style="segmented"
          value={f.completion}
          onChange={(completion) => set({ completion })}
          options={[
            { value: 'all', label: t('tours.filters.completionAll') },
            { value: 'open', label: t('tours.filters.completionOpen') },
            { value: 'done', label: t('tours.filters.completionDone') },
          ]}
        />
      </ListSection>
      {tab === 'friends' && owners.length > 0 ? (
        <ListSection title={t('tours.filters.ownerLabel')}>
          {owners.map((owner) => (
            <ListRow
              key={owner.id}
              title={owner.label}
              icon="person"
              checked={f.ownerIds.has(owner.id)}
              onPress={() => set({ ownerIds: toggled(f.ownerIds, owner.id) })}
              chevron={false}
            />
          ))}
        </ListSection>
      ) : null}
      {tab === 'owned' && contacts.length > 0 ? (
        <ListSection title={t('tours.filters.partnerLabel')}>
          {contacts.map((contact) => (
            <ListRow
              key={contact.id}
              title={resolveContactName(contact)}
              icon="person"
              checked={f.partnerIds.has(contact.id)}
              onPress={() => set({ partnerIds: toggled(f.partnerIds, contact.id) })}
              chevron={false}
            />
          ))}
        </ListSection>
      ) : null}
      <ListSection title={t('tours.filters.activityLabel')}>
        {TOUR_TYPE_VALUES.map((type: TourType) => (
          <ListRow
            key={type}
            title={t(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}` as 'tours.type.hiking')}
            icon={TOUR_TYPE_ICONS[type] as IconName}
            iconColor={TOUR_TYPE_COLORS[type]}
            checked={f.tourTypes.has(type)}
            onPress={() => set({ tourTypes: toggled(f.tourTypes, type) })}
            chevron={false}
          />
        ))}
      </ListSection>
      {scales.map((scale) => (
        <ListSection
          key={scale.grades.join()}
          title={t('tours.filters.gradeScale', { activities: scale.activities })}
        >
          {scale.grades.map((grade) => (
            <ListRow
              key={grade}
              title={grade}
              checked={f.grades.has(grade)}
              onPress={() => set({ grades: toggled(f.grades, grade) })}
              chevron={false}
            />
          ))}
        </ListSection>
      ))}
      <ListSection title={t('tours.filters.seasonLabel')}>
        {SEASON_VALUES.map((season: Season) => (
          <ListRow
            key={season}
            title={t(`tours.season.${season}`)}
            checked={f.seasons.has(season)}
            onPress={() => set({ seasons: toggled(f.seasons, season) })}
            chevron={false}
          />
        ))}
      </ListSection>
      <ListSection title={t('tours.filters.plannedDateLabel')}>
        <DateRow
          title={t('tours.filters.dateFromLabel')}
          value={f.dateFrom}
          placeholder={t('tours.filters.anyDate')}
          onChange={(dateFrom) => set({ dateFrom })}
          onClear={() => set({ dateFrom: null })}
          clearLabel={t('tours.filters.resetBtn')}
        />
        <DateRow
          title={t('tours.filters.dateToLabel')}
          value={f.dateTo}
          minimumDate={f.dateFrom ?? undefined}
          placeholder={t('tours.filters.anyDate')}
          onChange={(dateTo) => set({ dateTo })}
          onClear={() => set({ dateTo: null })}
          clearLabel={t('tours.filters.resetBtn')}
        />
      </ListSection>
    </Page>
  );
}
