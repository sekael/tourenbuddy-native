import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/core/adaptive/icon';
import { Text } from '@/core/adaptive/text';
import { useFormatter } from '@/core/i18n/format';
import { color, radius, size, space, strong } from '@/core/theme/tokens';
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

/**
 * The month (calendar-planned): Monday first, six weeks so the height never jumps, a dot per
 * tour in its activity's colour, the user's free days tinted, a small count of free friends.
 * While availability is edited a tap marks or clears a day from today on.
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
  const cells = useMemo(() => buildMonthGrid(month), [month]);
  const today = dayKey(new Date());
  const weekdays = useMemo(() => {
    const format = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)));
  }, [i18n.language]);
  const shift = (by: number) => onMonth(new Date(month.getFullYear(), month.getMonth() + by, 1));

  return (
    <View style={styles.grid}>
      <View style={styles.header}>
        <Text variant="title" role="heading" style={styles.month}>
          {formatDate(month, { month: 'long', year: 'numeric' })}
        </Text>
        {onToday && (selected !== today || dayKey(month).slice(0, 7) !== today.slice(0, 7)) ? (
          <Pressable
            role="button"
            onPress={onToday}
            style={({ pressed }) => [styles.todayButton, pressed && styles.todayButtonPressed]}
          >
            <Text variant="caption" style={styles.todayButtonLabel}>
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
          <Text key={i} variant="caption" style={styles.weekday}>
            {day}
          </Text>
        ))}
      </View>
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
                    <Text variant="caption" style={styles.friends}>
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

const styles = StyleSheet.create({
  grid: { gap: space.xxs, paddingBottom: space.xs },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  todayButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    backgroundColor: color.secondaryContainer,
  },
  todayButtonPressed: { backgroundColor: color.secondaryContainerPressed },
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
