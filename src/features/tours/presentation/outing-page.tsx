import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { EmptyState, ListRow, ListSection, TextRow } from '@/core/adaptive/list';
import { usePageOnTop } from '@/core/adaptive/page-on-top';
import { Page } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { useFormatter } from '@/core/i18n/format';
import { createLogger } from '@/core/logging/logger';
import { color, space } from '@/core/theme/tokens';
import { useFriendDisplayName } from '@/features/friendships/presentation/use-friend-display-name';
import { useMapStore } from '@/features/map/presentation/stores/map-store';
import {
  outingDateConflicts,
  outingDisplayName,
  outingGaps,
  outingNights,
  outingSegments,
  outingSpan,
  outingWay,
  spanDays,
} from '@/features/tours/domain/outing';

import { useToursStore } from './stores/tours-store';
import { tourIcon } from './tour-rows';

const log = createLogger('OutingPage');

/** A stage tap older than this found no outing page to open it: it is dropped. */
const STALE_REQUEST_MS = 1500;

/**
 * A whole outing (tour-outings): its days and segments, the way from first start to last finish,
 * and its segments in order, each a tap away; the owner renames it, moves a segment up or down,
 * removes one, or adds the next. Opening it shows the whole outing on the map.
 */
export function OutingPage({
  outingKey,
  onOpenTour,
  onClose,
}: {
  outingKey: string;
  onOpenTour: (id: string) => void;
  /** As a sheet's root: its close button. */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { formatDate, formatDateRange } = useFormatter();
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const segments = outingSegments([...tours, ...friendTours], outingKey);
  const first = segments[0] ?? null;
  const isOwner = !!first && !first.isFriendTour;
  const owner = useFriendDisplayName(first?.isFriendTour ? first.userId : null);
  const [name, setName] = useState(first?.outing?.name ?? '');
  const [busy, setBusy] = useState(false);

  // The map shows the whole outing while this page is the one showing; a stage opened over it
  // takes the map, and Back gives it back.
  const onTop = usePageOnTop();
  useEffect(() => {
    if (!onTop) return;
    useMapStore.getState().selectOuting(outingKey);
    return () => {
      if (useMapStore.getState().selectedOutingKey === outingKey) {
        useMapStore.getState().selectOuting(null);
      }
    };
  }, [outingKey, onTop]);

  // A stage's marker tapped on the map while the outing shows: that stage opens over this page.
  const request = useMapStore((s) => s.segmentRequest);
  useEffect(() => {
    if (!onTop || !request || Date.now() - request.at > STALE_REQUEST_MS) return;
    if (!segments.some((s) => s.id === request.id)) return;
    useMapStore.setState({ segmentRequest: null });
    onOpenTour(request.id);
    // A new request, not new props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  if (!first) {
    return (
      <Page title={t('tours.infoSheet.unnamedTour')} onClose={onClose}>
        <EmptyState icon="search_off" title={t('tours.infoSheet.gone')} />
      </Page>
    );
  }

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      log.error('Outing edit failed', error);
      Alert.alert(t('tours.outing.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const store = useToursStore.getState();
  const span = outingSpan(segments);
  const days = span ? spanDays(span) : 1;
  const count = t('tours.outing.segmentCount', { count: segments.length });
  const way = outingWay(segments);
  const gaps = new Set(outingGaps(segments).map((g) => g.index));
  const conflicts = outingDateConflicts(segments);
  const nights = outingNights(segments);

  const hero = (
    <View style={styles.hero}>
      <Text variant="title" role="heading">
        {outingDisplayName(segments) ?? t('tours.infoSheet.unnamedTour')}
      </Text>
      <Text>{days > 1 ? `${t('tours.outing.dayCount', { count: days })} · ${count}` : count}</Text>
      {span ? (
        <Text style={styles.meta}>
          {formatDateRange(span.start, span.end, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </Text>
      ) : null}
      {way ? <Text style={styles.meta}>{`${way.from} → ${way.to}`}</Text> : null}
      {first.isFriendTour ? (
        <Text style={styles.owner}>
          {owner.isResolved
            ? t('tours.infoSheet.createdByLabel', { name: owner.displayName ?? '' })
            : ' '}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Page
      title={outingDisplayName(segments) ?? t('tours.infoSheet.unnamedTour')}
      titleInHeader
      onClose={onClose}
      header={hero}
    >
      {isOwner ? (
        <ListSection footer={t('tours.outing.ruleHint')}>
          <TextRow
            label={t('tours.outing.nameLabel')}
            placeholder={t('tours.outing.namePlaceholder')}
            value={name}
            onChangeText={setName}
            onSubmit={() => void run(() => store.renameOuting(segments, name))}
          />
        </ListSection>
      ) : null}
      <ListSection title={t('tours.outing.segmentsHeader')}>
        {segments.map((segment, index) => {
          const hints = [
            nights.has(index) ? t('tours.outing.night') : null,
            gaps.has(index) ? t('tours.outing.gapHint', { n: index }) : null,
            conflicts.has(index) ? t('tours.outing.dateBeforeHint', { n: index }) : null,
          ].filter(Boolean);
          const date = segment.plannedDate
            ? formatDate(segment.plannedDate, { weekday: 'short', day: 'numeric', month: 'short' })
            : null;
          const { icon, tint } = tourIcon(segment);
          return (
            <ListRow
              key={segment.id}
              title={`${index + 1}. ${segment.name ?? t('tours.infoSheet.unnamedTour')}`}
              subtitle={[date, ...hints].filter(Boolean).join(' · ') || undefined}
              icon={gaps.has(index) || conflicts.has(index) ? 'warning' : icon}
              iconColor={gaps.has(index) || conflicts.has(index) ? color.error : tint}
              disabled={busy}
              onPress={() => onOpenTour(segment.id)}
              swipeActions={
                isOwner
                  ? [
                      {
                        label: t('tours.outing.remove'),
                        icon: 'remove_circle_outline',
                        destructive: true,
                        onPress: () => void run(() => store.removeFromOuting(segments, segment.id)),
                      },
                    ]
                  : undefined
              }
              contextActions={
                isOwner
                  ? [
                      ...(index > 0
                        ? [
                            {
                              label: t('tours.outing.moveUp'),
                              icon: 'arrow_upward' as const,
                              onPress: () =>
                                void run(() => store.reorderSegments(segments, index, index - 1)),
                            },
                          ]
                        : []),
                      ...(index < segments.length - 1
                        ? [
                            {
                              label: t('tours.outing.moveDown'),
                              icon: 'arrow_downward' as const,
                              onPress: () =>
                                void run(() => store.reorderSegments(segments, index, index + 1)),
                            },
                          ]
                        : []),
                      ...(gaps.has(index)
                        ? [
                            {
                              label: t('tours.outing.connect'),
                              icon: 'link' as const,
                              onPress: () =>
                                void run(() =>
                                  store.connectSegments(segments[index - 1]!, segment),
                                ),
                            },
                          ]
                        : []),
                      {
                        label: t('tours.outing.remove'),
                        icon: 'remove_circle_outline' as const,
                        destructive: true,
                        onPress: () => void run(() => store.removeFromOuting(segments, segment.id)),
                      },
                    ]
                  : undefined
              }
            />
          );
        })}
      </ListSection>
      {isOwner ? (
        <ListSection>
          <ListRow
            title={t('tours.outing.addSegment')}
            icon="add_road"
            onPress={() =>
              router.push({ pathname: '/tour/add-segment', params: { id: segments.at(-1)!.id } })
            }
          />
        </ListSection>
      ) : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.xxs, paddingVertical: space.xs },
  meta: { color: color.onSurfaceVariant },
  owner: { color: color.primary },
});
