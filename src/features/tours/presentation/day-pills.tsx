import { useTranslation } from 'react-i18next';

import { ContentRow, ListSection } from '@/core/adaptive/list';
import { Pills } from '@/core/adaptive/pills';
import { outingKey, outingSegments } from '@/features/tours/domain/outing';

import { useTourDraftStore } from './stores/tour-draft-store';
import { useToursStore } from './stores/tours-store';

/** The days before the first laid out: a new segment's outing's (Add segment), else none. */
export function useDayOffset(): number {
  const anchorId = useTourDraftStore((s) => s.segmentOf);
  const tours = useToursStore((s) => s.tours);
  const anchor = anchorId ? tours.find((x) => x.id === anchorId) : undefined;
  return anchor ? Math.max(1, outingSegments(tours, outingKey(anchor)).length) : 0;
}

/**
 * A day's name while a trip is laid out (tour-outings): "Day 2", or "Day 2 of 3" while a span is
 * split. A new segment's days count on after its outing's (Add segment).
 */
export function useDayLabel(): (index: number) => string {
  const { t } = useTranslation();
  const dayCount = useTourDraftStore((s) => s.dayCount);
  const offset = useDayOffset();
  return (index) => {
    const n = offset + index + 1;
    return dayCount && n <= dayCount
      ? t('tours.creation.dayOf', { n, count: dayCount })
      : t('tours.creation.day', { n });
  };
}

/** The trip's days as pills, the one on screen lit; a tap shows that day (form and route step). */
export function DayPills({ onSelect }: { onSelect: (index: number) => void }) {
  const { t } = useTranslation();
  const stages = useTourDraftStore((s) => s.stages);
  const active = useTourDraftStore((s) => s.active);
  const name = useTourDraftStore((s) => s.draft.name);
  const dayLabel = useDayLabel();
  if (stages.length < 2) return null;
  return (
    <ListSection title={t('tours.creation.daysLabel')}>
      <ContentRow>
        <Pills
          single
          accessibilityLabel={t('tours.creation.daysLabel')}
          options={stages.map((day, i) => {
            const named = (i === active ? name : day.draft.name)?.trim();
            return { value: String(i), label: named ? `${dayLabel(i)} · ${named}` : dayLabel(i) };
          })}
          selected={[String(active)]}
          onToggle={(value) => onSelect(Number(value))}
        />
      </ContentRow>
    </ListSection>
  );
}
