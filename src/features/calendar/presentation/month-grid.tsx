import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { Icon } from '@/core/adaptive/icon';
import { Text } from '@/core/adaptive/text';
import { useFormatter } from '@/core/i18n/format';
import { color, radius, size, space, strong } from '@/core/theme/tokens';
import { useReducedMotion } from '@/core/theme/use-reduced-motion';
import { buildMonthGrid, dayKey, type DayEntry } from '@/features/calendar/domain/calendar-dates';
import { TOUR_TYPE_COLORS } from '@/features/tours/data/models/tour-type';

export type MonthGridProps = {
  month: Date;
  onMonth: (month: Date) => void;
  selected: string;
  onSelect: (key: string) => void;
  entriesByDay: Map<string, DayEntry[]>;
  friendsByDay: Map<string, string[]>;
  availableDays: Set<string>;
  /** Availability edit: future days toggle instead of selecting. */
  editing: boolean;
  onToggle: (key: string) => void;
  /** Back to this month and today, shown while another month or day is in view. */
  onToday?: () => void;
};

/** Months a swipe reaches: a century either way of the month the grid opened on. */
const REACH = 1200;
/** Between two months as they pass. */
const PAGE_GAP = space.xl;
const PAGES = Array.from({ length: REACH * 2 + 1 }, (_, i) => i);

const monthsBetween = (from: Date, to: Date) =>
  (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth();

/**
 * The month (calendar-planned): Monday first, six weeks so the height never jumps, a dot per
 * tour in its activity's colour, the user's free days tinted, a small count of free friends.
 * While availability is edited a tap marks or clears a day from today on.
 *
 * The weeks swipe sideways to the month before or after, a page at a time under the finger, as
 * the system's own pagers do; the title follows once the next month is half in view. The arrows,
 * Today and a day outside the month scroll there too (a cut under Reduce Motion).
 */
export function MonthGrid({
  month,
  onMonth,
  selected,
  onSelect,
  entriesByDay,
  friendsByDay,
  availableDays,
  editing,
  onToggle,
  onToday,
}: MonthGridProps) {
  const { t, i18n } = useTranslation();
  const { formatDate } = useFormatter();
  const today = dayKey(new Date());
  const reducedMotion = useReducedMotion();
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)));
  }, [i18n.language]);
  const shift = (by: number) => onMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  // The pages are months counted from the one the grid opened on.
  const [origin] = useState(month);
  const pageOf = (value: Date) =>
    Math.min(Math.max(REACH + monthsBetween(origin, value), 0), 2 * REACH);
  const monthOf = (page: number) =>
    new Date(origin.getFullYear(), origin.getMonth() + page - REACH, 1);
  const page = pageOf(month);
  const [width, setWidth] = useState(0);
  const list = useRef<FlatList<number>>(null);
  /** The page in view, or on its way into view. */
  const shown = useRef(page);
  /** A finger moves the pages (until they settle): their offset names the month. */
  const swiping = useRef(false);

  // A month set from outside (the arrows, Today, a day outside it, a link) scrolls there.
  useEffect(() => {
    if (page === shown.current) return;
    shown.current = page;
    swiping.current = false;
    list.current?.scrollToIndex({ index: page, animated: !reducedMotion });
  }, [page, reducedMotion]);

  const follow = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!swiping.current || !width) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / (width + PAGE_GAP));
    if (next === shown.current) return;
    shown.current = next;
    onMonth(monthOf(next));
  };

  const weeks = (value: Date) => (
    <Weeks
      month={value}
      today={today}
      onMonth={onMonth}
      selected={selected}
      onSelect={onSelect}
      entriesByDay={entriesByDay}
      friendsByDay={friendsByDay}
      availableDays={availableDays}
      editing={editing}
      onToggle={onToggle}
    />
  );

  const awayFromToday = selected !== today || dayKey(month).slice(0, 7) !== today.slice(0, 7);

  return (
    <View style={styles.grid}>
      <View style={styles.header}>
        <Text
          variant="title"
          role="heading"
          style={styles.month}
          maxFontSizeMultiplier={GRID_SCALE}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {formatDate(month, { month: 'long', year: 'numeric' })}
        </Text>
        {/* Always in place, shown only away from today: the header never shifts. */}
        {onToday ? (
          <Pressable
            role="button"
            onPress={onToday}
            disabled={!awayFromToday}
            accessibilityElementsHidden={!awayFromToday}
            importantForAccessibility={awayFromToday ? 'auto' : 'no-hide-descendants'}
            style={({ pressed }) => [
              styles.todayButton,
              pressed && styles.todayButtonPressed,
              !awayFromToday && styles.hidden,
            ]}
          >
            <Text
              variant="caption"
              style={styles.todayButtonLabel}
              maxFontSizeMultiplier={GRID_SCALE}
            >
              {t('calendar.today')}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          role="button"
          aria-label={t('calendar.planned.prevMonth')}
          onPress={() => shift(-1)}
          style={styles.chevron}
        >
          <Icon name="chevron_left" color={color.primary} />
        </Pressable>
        <Pressable
          role="button"
          aria-label={t('calendar.planned.nextMonth')}
          onPress={() => shift(1)}
          style={styles.chevron}
        >
          <Icon name="chevron_right" color={color.primary} />
        </Pressable>
      </View>
      <View style={styles.row} importantForAccessibility="no-hide-descendants">
        {weekdays.map((day, i) => (
          <Text key={i} variant="caption" style={styles.weekday} maxFontSizeMultiplier={GRID_SCALE}>
            {day}
          </Text>
        ))}
      </View>
      {/* Measured first: until then the month stands alone, at the height the pages will have. */}
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {width ? (
          <FlatList
            // A new width (rotation) starts the pages anew, at the month in view.
            key={width}
            ref={list}
            data={PAGES}
            keyExtractor={String}
            horizontal
            // A month at a time, the next one clear of it by a gap: side by side, two months'
            // days would line up into one grid of mixed dates.
            snapToInterval={width + PAGE_GAP}
            decelerationRate="fast"
            disableIntervalMomentum
            showsHorizontalScrollIndicator={false}
            // Each month is the grid's width and its gap: the list opens on one at once, and
            // renders only it and its neighbours.
            getItemLayout={(_, index) => ({
              length: width + PAGE_GAP,
              offset: (width + PAGE_GAP) * index,
              index,
            })}
            initialScrollIndex={page}
            initialNumToRender={1}
            maxToRenderPerBatch={1}
            windowSize={3}
            onScrollBeginDrag={() => {
              swiping.current = true;
            }}
            onScroll={follow}
            scrollEventThrottle={16}
            onMomentumScrollEnd={(event) => {
              follow(event);
              swiping.current = false;
            }}
            // The neighbours wait off screen: VoiceOver and TalkBack read only the month in view.
            renderItem={({ item }) => (
              <View
                style={{ width: width + PAGE_GAP, paddingRight: PAGE_GAP }}
                accessibilityElementsHidden={item !== page}
                importantForAccessibility={item === page ? 'auto' : 'no-hide-descendants'}
              >
                {weeks(monthOf(item))}
              </View>
            )}
          />
        ) : (
          weeks(month)
        )}
      </View>
    </View>
  );
}

type WeeksProps = Pick<
  MonthGridProps,
  | 'month'
  | 'onMonth'
  | 'selected'
  | 'onSelect'
  | 'entriesByDay'
  | 'friendsByDay'
  | 'availableDays'
  | 'editing'
  | 'onToggle'
> & { today: string };

/** One month's six weeks: a page of the grid. */
function Weeks({
  month,
  today,
  onMonth,
  selected,
  onSelect,
  entriesByDay,
  friendsByDay,
  availableDays,
  editing,
  onToggle,
}: WeeksProps) {
  const { t } = useTranslation();
  const { formatDate } = useFormatter();
  const cells = useMemo(() => buildMonthGrid(month), [month]);

  return (
    <View style={styles.weeks}>
      {Array.from({ length: 6 }, (_, week) => (
        <View key={week} style={styles.row}>
          {cells.slice(week * 7, week * 7 + 7).map(({ date, inMonth }) => {
            const key = dayKey(date);
            const entries = entriesByDay.get(key) ?? [];
            const friends = friendsByDay.get(key)?.length ?? 0;
            const free = availableDays.has(key);
            const isToday = key === today;
            const isSelected = key === selected && !editing;
            const selectable = !editing || (inMonth && key >= today);
            const label = [
              formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }),
              entries.length ? t('calendar.planned.tourCount', { count: entries.length }) : null,
              friends ? t('calendar.planned.friendCount', { count: friends }) : null,
              free ? t('calendar.availability.freeLabel') : null,
            ]
              .filter(Boolean)
              .join(', ');
            return (
              <Pressable
                key={key}
                role="button"
                aria-label={label}
                aria-selected={isSelected}
                disabled={!selectable}
                onPress={() => {
                  if (editing) {
                    void Haptics.selectionAsync();
                    onToggle(key);
                  } else {
                    onSelect(key);
                    if (!inMonth) onMonth(new Date(date.getFullYear(), date.getMonth(), 1));
                  }
                }}
                style={[styles.cell, free && styles.free]}
              >
                <View style={[styles.day, isSelected && styles.daySelected]}>
                  <Text
                    maxFontSizeMultiplier={GRID_SCALE}
                    style={[
                      styles.dayText,
                      !inMonth && styles.outside,
                      isToday && styles.today,
                      isSelected && styles.selectedText,
                      editing && !selectable && styles.outside,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </View>
                <View style={styles.marks}>
                  {entries.slice(0, 3).map((entry) => (
                    <View
                      key={entry.tour.id}
                      style={[
                        styles.dot,
                        {
                          backgroundColor: entry.tour.tourTypes[0]
                            ? TOUR_TYPE_COLORS[entry.tour.tourTypes[0]]
                            : color.primary,
                        },
                        entry.isFriend && styles.friendDot,
                      ]}
                    />
                  ))}
                  {friends ? (
                    <Text
                      variant="caption"
                      style={styles.friends}
                      maxFontSizeMultiplier={GRID_SCALE}
                    >
                      {`+${friends}`}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const DAY = 32;
const DOT = 6;
/**
 * Seven days share a phone's width and each sits in its circle: the grid grows with Dynamic Type
 * only so far, as the system calendar's month and a tab bar's labels do.
 */
const GRID_SCALE = 1.4;

const styles = StyleSheet.create({
  grid: { gap: space.xxs, paddingBottom: space.xs },
  weeks: { gap: space.xxs },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  todayButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.secondaryContainer,
  },
  todayButtonPressed: { backgroundColor: color.secondaryContainerPressed },
  hidden: { opacity: 0 },
  todayButtonLabel: { ...strong, color: color.onSecondaryContainer },
  month: { flex: 1 },
  chevron: {
    width: size.touch,
    height: size.touch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', color: color.onSurfaceVariant },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space.xxs,
    minHeight: size.touch + space.xs,
    borderRadius: radius.sm,
  },
  free: { backgroundColor: color.secondaryContainer },
  day: {
    width: DAY,
    height: DAY,
    borderRadius: DAY / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  daySelected: { backgroundColor: color.primary },
  dayText: { fontVariant: ['tabular-nums'] },
  outside: { color: color.outlineVariant },
  today: { color: color.primary, ...strong },
  selectedText: { color: color.onContrast, ...strong },
  marks: { flexDirection: 'row', alignItems: 'center', gap: space.xxs / 2, minHeight: DOT * 2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  friendDot: { opacity: 0.55 },
  friends: { color: color.onSurfaceVariant },
});
