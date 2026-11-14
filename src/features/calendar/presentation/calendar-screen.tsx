import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState, ListRow, ListSection } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { useFormatter } from '@/core/i18n/format';
import { dayKey, spanDayKeys, type DayEntry } from '@/features/calendar/domain/calendar-dates';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { openTour } from '@/features/map/presentation/open-tour';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';
import { TourRow } from '@/features/tours/presentation/tour-rows';
import { useUserProfileStore } from '@/features/user/presentation/stores/user-profile-store';

import { MonthGrid } from './month-grid';
import { SeasonsChart } from './seasons-chart';
import { useAvailabilityStore } from './stores/availability-store';
import { useCalendarFeedStore } from './stores/calendar-feed-store';

type View = 'planned' | 'seasons';

/** Who a friend is to the user: their contact, else the name they gave. */
function useFriendNames() {
  const contacts = useContactsStore((s) => s.contacts);
  const phones = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const names = useFriendshipsStore((s) => s.userIdToNamesMap);
  return useMemo(() => {
    const find = useContactsStore.getState().findContactByMethodValue;
    return (userId: string) => {
      const phone = phones.get(userId);
      const contact = phone ? find('phone', phone) : undefined;
      if (contact) return { name: resolveContactName(contact), contactId: contact.id };
      const entry = names.get(userId);
      return {
        name: `${entry?.firstName ?? ''} ${entry?.lastName ?? ''}`.trim() || null,
        contactId: null,
      };
    };
    // `contacts` changes what `find` returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, phones, names]);
}

/**
 * The Calendar tab (calendar-planned, calendar-seasons, calendar-availability): the month with
 * the user's and their partners' tours, their free days and their friends'; a day's tours and
 * free friends below it; the seasons for tours planned by season; availability marked day by day
 * and shared with friends.
 */
export function CalendarScreen() {
  const { t } = useTranslation();
  const { formatDate } = useFormatter();
  const [view, setView] = useState<View>('planned');
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  // A weekly summary opens its first free day.
  const { day } = useLocalSearchParams<{ day?: string }>();
  const [opened, setOpened] = useState<string | undefined>(undefined);
  if (day !== opened) {
    setOpened(day);
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
      const [y, m] = day.split('-').map(Number);
      setView('planned');
      setMonth(new Date(y!, m! - 1, 1));
      setSelected(day);
    }
  }
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const editing = useAvailabilityStore((s) => s.editing);
  const saving = useAvailabilityStore((s) => s.saving);
  const savedDays = useAvailabilityStore((s) => s.savedDays);
  const workingDays = useAvailabilityStore((s) => s.workingDays);
  const friendDays = useAvailabilityStore((s) => s.friendDays);
  const hasFeeds = useCalendarFeedStore((s) => s.feeds.length > 0);
  const friendName = useFriendNames();
  const showTip = useUserProfileStore((s) => !!s.profile?.calendarTourShowOnFirstOpen);

  useEffect(() => {
    void useCalendarFeedStore.getState().loadFeeds();
  }, []);
  useEffect(() => {
    const ids = [...new Set(friendDays.map((r) => r.user_id))];
    if (!ids.length) return;
    void useFriendshipsStore.getState().ensurePhones(ids);
    void useFriendshipsStore.getState().getNamesByUserIds(ids);
  }, [friendDays]);

  const entriesByDay = useMemo(() => {
    const map = new Map<string, DayEntry[]>();
    const add = (tour: Tour, isFriend: boolean) => {
      if (!tour.plannedDate) return;
      const keys = spanDayKeys(tour.plannedDate, tour.endDate);
      keys.forEach((key, i) =>
        map.set(key, [
          ...(map.get(key) ?? []),
          { tour, isFriend, dayIndex: i + 1, dayCount: keys.length },
        ]),
      );
    };
    tours.forEach((tour) => add(tour, false));
    friendTours.filter((tour) => tour.isPartner).forEach((tour) => add(tour, true));
    return map;
  }, [tours, friendTours]);

  const friendsByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of friendDays) map.set(row.date, [...(map.get(row.date) ?? []), row.user_id]);
    return map;
  }, [friendDays]);

  const dayEntries = entriesByDay.get(selected) ?? [];
  const dayFriends = friendsByDay.get(selected) ?? [];
  const [y, m, d] = selected.split('-').map(Number);
  const selectedDate = new Date(y!, m! - 1, d!);
  const store = useAvailabilityStore.getState();

  async function save() {
    const ok = await store.save();
    if (ok) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else Alert.alert(t('calendar.availability.saveFailed'));
  }

  const goToday = () => {
    const now = new Date();
    setMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(dayKey(now));
  };

  // One page for both views, its bar the same in both: only the switch between them, so it never
  // moves or changes as the view does. The month's own controls sit with the month.
  const viewSwitch = {
    value: view,
    options: [
      { value: 'planned', label: t('calendar.nav.planned') },
      { value: 'seasons', label: t('calendar.nav.seasons') },
    ],
    onChange: (next: string) => setView(next as View),
  };

  return (
    <Page
      largeTitle={!editing}
      title={editing ? t('calendar.availability.editTitle') : t('shell.tabs.calendar')}
      titleControl={editing ? undefined : viewSwitch}
      cancel={
        editing ? { label: t('calendar.availability.cancel'), onPress: store.cancel } : undefined
      }
      confirm={
        editing
          ? { label: t('calendar.availability.save'), onPress: () => void save(), disabled: saving }
          : undefined
      }
      header={
        view === 'seasons' ? (
          tours.length ? (
            <SeasonsChart tours={tours} onOpen={openTour} />
          ) : undefined
        ) : (
          <MonthGrid
            month={month}
            onMonth={setMonth}
            selected={selected}
            onSelect={setSelected}
            entriesByDay={entriesByDay}
            friendsByDay={friendsByDay}
            availableDays={editing ? workingDays : savedDays}
            editing={editing}
            onToggle={store.toggleDay}
            onToday={editing ? undefined : goToday}
          />
        )
      }
    >
      {view === 'seasons' ? (
        <SeasonsView tours={tours} />
      ) : editing ? (
        <ListSection
          footer={[
            t('calendar.availability.disclaimer'),
            hasFeeds ? t('calendar.availability.calendarNote') : null,
          ]
            .filter(Boolean)
            .join('\n\n')}
        >
          <ListRow
            title={t('calendar.availability.markHint')}
            icon="event_available"
            chevron={false}
          />
        </ListSection>
      ) : (
        <>
          {showTip ? <CalendarTip /> : null}
          <ListSection>
            <ListRow
              title={t('calendar.availability.edit')}
              icon="event_available"
              onPress={store.enterEdit}
            />
          </ListSection>
          <ListSection
            title={formatDate(selectedDate, { weekday: 'long', day: 'numeric', month: 'long' })}
          >
            {dayEntries.length ? (
              dayEntries.map((entry) => (
                <TourRow
                  key={entry.tour.id}
                  tour={entry.tour}
                  span={
                    entry.dayCount > 1 ? { day: entry.dayIndex, total: entry.dayCount } : undefined
                  }
                  onPress={() => openTour(entry.tour.id)}
                />
              ))
            ) : (
              <ListRow title={t('calendar.planned.noTours')} chevron={false} />
            )}
          </ListSection>
          {dayFriends.length ? (
            <ListSection title={t('calendar.planned.friendsHeading')}>
              {dayFriends.map((userId) => {
                const friend = friendName(userId);
                return (
                  <ListRow
                    key={userId}
                    title={friend.name ?? ' '}
                    icon="person"
                    onPress={
                      friend.contactId
                        ? () =>
                            router.push({
                              pathname: '/contact/[id]',
                              params: { id: friend.contactId! },
                            })
                        : undefined
                    }
                  />
                );
              })}
            </ListSection>
          ) : null}
        </>
      )}
    </Page>
  );
}

/**
 * The calendar's tour as an inline tip (onboarding-tour, D12 as revised): what the month shows,
 * marking free days, the seasons and Today, until the user dismisses it.
 */
function CalendarTip() {
  const { t } = useTranslation();
  return (
    <ListSection title={t('calendar.tour.welcome.title')}>
      <ListRow
        title={t('calendar.tour.dayChips.title')}
        subtitle={t('calendar.tour.dayChips.body')}
        icon="calendar_view_day"
        chevron={false}
      />
      <ListRow
        title={t('calendar.tour.availability.title')}
        subtitle={t('calendar.tour.availability.body')}
        icon="event_available"
        onPress={useAvailabilityStore.getState().enterEdit}
      />
      <ListRow
        title={t('calendar.tour.seasons.title')}
        subtitle={t('calendar.tour.seasons.body')}
        icon="wb_sunny"
        chevron={false}
      />
      <ListRow
        title={t('onboarding.tour.controls.done')}
        icon="check"
        chevron={false}
        onPress={() => void useUserProfileStore.getState().dismissCalendarTour()}
      />
    </ListSection>
  );
}

/** Tours by season (calendar-view "Seasons view"): the chart, or a hint without tours. */
function SeasonsView({ tours }: { tours: Tour[] }) {
  const { t } = useTranslation();
  if (!tours.length) {
    return <EmptyState icon="wb_sunny" title={t('calendar.seasons.emptyState')} />;
  }
  return null;
}
