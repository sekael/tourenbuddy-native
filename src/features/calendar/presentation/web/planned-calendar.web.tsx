import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type Ref,
} from 'react';
import { useTranslation } from 'react-i18next';

import { AdaptiveOverlay } from '@/core/web/adaptive-overlay.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { Transition } from '@/core/web/transition.web';
import { useNextTick } from '@/core/web/use-next-tick.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import {
  buildMonthGrid,
  dayKey,
  spanDayKeys,
  type DayEntry,
} from '@/features/calendar/domain/calendar-dates';
import { useAvailabilityStore } from '@/features/calendar/presentation/stores/availability-store';
import { resolveContactName, type Contact } from '@/features/contacts/domain/entities/contact';
import { phoneKey } from '@/features/contacts/presentation/contact-links';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { ContactActionMenu } from '@/features/contacts/presentation/web/contact-action-menu.web';
import { usePhoneDirectory } from '@/features/contacts/presentation/web/use-phone-directory.web';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { TOUR_TYPE_COLORS, TOUR_TYPE_ICONS } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import { DayPreview } from './day-preview.web';
import styles from './planned-calendar.module.css';

const c = classes(styles);

export type PlannedCalendarHandle = {
  scrollTodayIntoView: (block?: ScrollLogicalPosition) => void;
  openDetailForDay: (date: Date) => void;
  closeDetail: () => void;
};
export type DemoChips = { entries: DayEntry[]; friends: { userId: string; name: string }[] };

/** One friend on one day; `contact` is null when only the profile name resolves. */
type FriendChip = { userId: string; name: string; contact: Contact | null };

/**
 * The planned view: own tours and friend tours the user partners on, availability, and friends'
 * free days. A month grid on desktop, a day list on phones; a day opens its detail list.
 */
export function PlannedCalendar({
  viewDate,
  demoChips,
  ref,
  onSelect,
  onEditContact,
}: {
  viewDate: Date;
  /** The calendar tour's demo chips for today: non-null only while the tour runs. */
  demoChips?: DemoChips | null;
  ref?: Ref<PlannedCalendarHandle>;
  onSelect: (tourId: string, originDay?: string) => void;
  onEditContact: (contactId: string) => void;
}) {
  'use no memo';
  const { t, i18n } = useTranslation('web');
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const editing = useAvailabilityStore((s) => s.editing);
  const displayDays = useAvailabilityStore((s) => (s.editing ? s.workingDays : s.savedDays));
  const friendDays = useAvailabilityStore((s) => s.friendDays);
  const contacts = useContactsStore((s) => s.contacts);
  const userIdToPhoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const verified = useAuthStore((s) => s.user?.phone_confirmed_at != null);
  const [phoneToUserIdMap] = usePhoneDirectory(contacts, verified);
  const isDesktop = useIsDesktop();
  const listEl = useRef<HTMLUListElement>(null);
  const nextTick = useNextTick();
  // Today's key, once per mount.
  const [todayKey] = useState(() => dayKey(new Date()));

  // Own planned tours and friend tours the user is a partner on, one entry per day of the span,
  // each knowing its place in the whole span.
  const entriesByDay = new Map<string, DayEntry[]>();
  const add = (tour: Tour, isFriend: boolean) => {
    if (!tour.plannedDate) return;
    const keys = spanDayKeys(tour.plannedDate, tour.endDate);
    keys.forEach((key, i) => {
      const entry = { tour, isFriend, dayIndex: i + 1, dayCount: keys.length };
      const bucket = entriesByDay.get(key);
      if (bucket) bucket.push(entry);
      else entriesByDay.set(key, [entry]);
    });
  };
  for (const tour of tours) add(tour, false);
  for (const tour of friendTours) if (tour.isPartner) add(tour, true);
  const entriesFor = (date: Date) => entriesByDay.get(dayKey(date)) ?? [];

  const cells = buildMonthGrid(viewDate);
  // Monday-first narrow weekday headers (2024-01-01 is a Monday).
  const narrow = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' });
  const weekdays = Array.from({ length: 7 }, (_, i) => narrow.format(new Date(2024, 0, 1 + i)));
  const weekdayFmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
  const monthDays = cells
    .filter((cell) => cell.inMonth)
    .map((cell) => ({
      date: cell.date,
      entries: entriesFor(cell.date),
      isToday: dayKey(cell.date) === todayKey,
    }));

  // Instant, not smooth: the tour's spotlight measures the row right after this.
  const scrollDayIntoView = (key: string, block: ScrollLogicalPosition = 'start') =>
    listEl.current
      ?.querySelector(`[data-day="${key}"]`)
      ?.scrollIntoView({ behavior: 'instant', block });

  // ── Availability overlay and editing
  const isAvailable = (date: Date) => displayDays.has(dayKey(date));
  const isSelectable = (date: Date, inMonth: boolean) =>
    editing && inMonth && dayKey(date) >= todayKey;

  // Drag-to-select: the first day pressed fixes mark vs clear for the whole gesture.
  const drag = useRef({ active: false, mode: 'mark' as 'mark' | 'clear' }).current;
  const store = () => useAvailabilityStore.getState();
  const daysNow = () => (store().editing ? store().workingDays : store().savedDays);
  function applyTo(date: Date, inMonth: boolean) {
    if (!isSelectable(date, inMonth)) return;
    const key = dayKey(date);
    const has = daysNow().has(key);
    if (drag.mode === 'mark' ? !has : has) store().toggleDay(key);
  }
  function onDayDown(event: PointerEvent, date: Date, inMonth: boolean) {
    if (!isSelectable(date, inMonth)) return;
    // Touch gets implicit capture on the origin cell: release it so each cell is hit-tested.
    const el = event.target as Element;
    if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    drag.mode = daysNow().has(dayKey(date)) ? 'clear' : 'mark';
    drag.active = true;
    applyTo(date, inMonth);
  }
  const onDayEnter = (date: Date, inMonth: boolean) => drag.active && applyTo(date, inMonth);
  const endDrag = () => (drag.active = false);

  // ── Friends' availability
  // userId → contact, through this page's phone directory; every friend is a contact.
  const contactByUserId = new Map<string, Contact>();
  for (const contact of contacts)
    for (const m of contact.contactMethods) {
      if (m.methodType !== 'phone') continue;
      const uid = phoneToUserIdMap.get(phoneKey(m.value));
      if (uid && !contactByUserId.has(uid)) contactByUserId.set(uid, contact);
    }
  // One batched phone lookup for every friend in availability.
  useEffect(() => {
    const ids = [...new Set(friendDays.map((r) => r.user_id))];
    if (ids.length) void useFriendshipsStore.getState().ensurePhones(ids);
  }, [friendDays]);
  /** Whichever map is warm: this page's phone → user, or the store's user → phone. */
  function contactFor(userId: string): Contact | null {
    const local = contactByUserId.get(userId);
    if (local) return local;
    const phone = userIdToPhoneMap.get(userId);
    return (
      (phone ? useContactsStore.getState().findContactByMethodValue('phone', phone) : undefined) ??
      null
    );
  }
  const friendsByDay = new Map<string, FriendChip[]>();
  {
    const byDay = new Map<string, Map<string, FriendChip>>();
    for (const row of friendDays) {
      if (row.date < todayKey) continue;
      // A friend is called what the user saved them as; the fallback renders a broken link (#273).
      const contact = contactFor(row.user_id);
      const chip = {
        userId: row.user_id,
        name: contact ? resolveContactName(contact) : t('tours.list.aFriend'),
        contact,
      };
      const inner = byDay.get(row.date);
      if (inner) inner.set(row.user_id, chip);
      else byDay.set(row.date, new Map([[row.user_id, chip]]));
    }
    for (const [day, inner] of byDay)
      friendsByDay.set(
        day,
        [...inner.values()].sort((a, b) => a.name.localeCompare(b.name)),
      );
  }
  const friendsFor = (date: Date) => friendsByDay.get(dayKey(date)) ?? [];
  const hasContent = (date: Date) => entriesFor(date).length > 0 || friendsFor(date).length > 0;

  // ── Contact action menu
  const [menu, setMenu] = useState<{ contact: Contact; rect: DOMRect } | null>(null);
  function openFriendMenu(chip: FriendChip, el: HTMLElement) {
    if (chip.contact) setMenu({ contact: chip.contact, rect: el.getBoundingClientRect() });
  }

  // ── Per-day detail list (tours first, then available friends)
  const [detailDate, setDetailDate] = useState<Date | null>(null);
  const closeDetail = () => setDetailDate(null);
  const isDemoDetail = demoChips != null && detailDate != null && dayKey(detailDate) === todayKey;
  const detailEntries = !detailDate
    ? []
    : isDemoDetail
      ? demoChips!.entries
      : entriesFor(detailDate);
  const detailFriends: FriendChip[] = !detailDate
    ? []
    : isDemoDetail
      ? demoChips!.friends.map((f) => ({ ...f, contact: null }))
      : friendsFor(detailDate);
  const detailLabel = detailDate
    ? new Intl.DateTimeFormat(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(detailDate)
    : '';

  // Desktop cell: opens the detail in view mode only (edit marking runs on pointer events).
  const onCellActivate = (date: Date, inMonth: boolean) =>
    !editing && inMonth && hasContent(date) && setDetailDate(date);
  // Mobile row: a tap toggles while editing (no drag; `click` skips scrolls), else opens the detail.
  function onRowActivate(date: Date) {
    if (editing) {
      if (isSelectable(date, true)) store().toggleDay(dayKey(date));
    } else if (hasContent(date)) setDetailDate(date);
  }

  useImperativeHandle(ref, () => ({
    scrollTodayIntoView: (block = 'start') => scrollDayIntoView(todayKey, block),
    openDetailForDay: (date) => {
      setDetailDate(date);
      void nextTick().then(() => scrollDayIntoView(dayKey(date)));
    },
    closeDetail,
  }));

  // The originating day rides along so back-nav returns to the day the user was on.
  function selectFromDetail(tourId: string) {
    const originDay = detailDate ? dayKey(detailDate) : undefined;
    closeDetail();
    onSelect(tourId, originDay);
  }

  const preview = (date: Date, isToday: boolean, inMonth = true) =>
    demoChips && isToday ? (
      <DayPreview entries={demoChips.entries} friends={demoChips.friends} />
    ) : inMonth ? (
      <DayPreview entries={entriesFor(date)} friends={friendsFor(date)} />
    ) : null;

  return (
    <>
      {isDesktop ? (
        <div className={c('calendar')}>
          <div className={c('weekday-row')}>
            {weekdays.map((day, i) => (
              <div key={i} className={c('weekday')}>
                {day}
              </div>
            ))}
          </div>
          <div
            className={c('day-grid')}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onPointerCancel={endDrag}
          >
            {cells.map((cell, i) => {
              const key = dayKey(cell.date);
              return (
                <div
                  key={i}
                  className={c('day-cell', {
                    'day-cell--muted': !cell.inMonth,
                    'day-cell--today': key === todayKey,
                    'day-cell--available': cell.inMonth && isAvailable(cell.date),
                    'day-cell--selectable': isSelectable(cell.date, cell.inMonth),
                  })}
                  data-tour={demoChips && key === todayKey ? 'demo-chips' : undefined}
                  onPointerDown={(e) => onDayDown(e, cell.date, cell.inMonth)}
                  onPointerEnter={() => onDayEnter(cell.date, cell.inMonth)}
                  onClick={() => onCellActivate(cell.date, cell.inMonth)}
                >
                  <span className={c('day-number')}>{cell.date.getDate()}</span>
                  {/* Preview only: the whole cell opens the detail list. */}
                  {preview(cell.date, key === todayKey, cell.inMonth)}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // Every day a row (empty ones too): chips get full width, free days stay visible.
        <ul ref={listEl} className={c('day-list')}>
          {monthDays.map((row) => (
            <li
              key={dayKey(row.date)}
              data-day={dayKey(row.date)}
              className={c('day-row', {
                'day-row--today': row.isToday,
                'day-row--available': isAvailable(row.date),
                'day-row--selectable': isSelectable(row.date, true),
              })}
              data-tour={demoChips && row.isToday ? 'demo-chips' : undefined}
              onClick={() => onRowActivate(row.date)}
            >
              <div className={c('day-head')}>
                <span className={c('day-weekday')}>{weekdayFmt.format(row.date)}</span>
                <span className={c('day-num')}>{row.date.getDate()}</span>
              </div>
              <div className={c('day-entries')}>{preview(row.date, row.isToday)}</div>
            </li>
          ))}
        </ul>
      )}

      <Transition name="sheet">
        {detailDate && (
          <div key="detail" className="sheet-host">
            <AdaptiveOverlay title={detailLabel} onClose={closeDetail}>
              <div
                className={c('detail-body')}
                data-tour={isDemoDetail ? 'demo-detail' : undefined}
              >
                {detailEntries.length > 0 && (
                  <>
                    <h3 className={c('detail-heading')}>{t('calendar.planned.toursHeading')}</h3>
                    {detailEntries.map((entry) => {
                      const type = entry.tour.tourTypes[0];
                      return (
                        <button
                          key={entry.tour.id}
                          type="button"
                          className={c('detail-row')}
                          onClick={() => selectFromDetail(entry.tour.id)}
                        >
                          {type && (
                            <BaseIcon
                              name={TOUR_TYPE_ICONS[type]}
                              size="sm"
                              style={{ color: TOUR_TYPE_COLORS[type] }}
                            />
                          )}
                          <span className={c('pill-name')}>
                            {entry.tour.name ?? t('tours.infoSheet.unnamedTour')}
                          </span>
                          {entry.dayCount > 1 && (
                            <span
                              className={c('day-counter')}
                              role="img"
                              aria-label={t('calendar.planned.dayCounterLabel', {
                                day: entry.dayIndex,
                                total: entry.dayCount,
                              })}
                            >
                              {t('calendar.planned.dayCounter', {
                                day: entry.dayIndex,
                                total: entry.dayCount,
                              })}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </>
                )}
                {detailFriends.length > 0 && (
                  <>
                    <h3 className={c('detail-heading')}>{t('calendar.planned.friendsHeading')}</h3>
                    {detailFriends.map((chip) => (
                      <button
                        key={chip.userId}
                        type="button"
                        className={c('detail-row', { 'detail-row--static': !chip.contact })}
                        onClick={(e) => openFriendMenu(chip, e.currentTarget)}
                      >
                        <BaseIcon name="person" size="sm" />
                        <span className={c('pill-name')}>{chip.name}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </AdaptiveOverlay>
          </div>
        )}
      </Transition>

      {menu && (
        <ContactActionMenu
          contact={menu.contact}
          anchorRect={menu.rect}
          onClose={() => setMenu(null)}
          onEditContact={(contactId) => {
            setMenu(null);
            closeDetail();
            onEditContact(contactId);
          }}
        />
      )}
    </>
  );
}
