import { router } from 'expo-router';
import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { EmptyState, ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { useFormatter } from '@/core/i18n/format';
import { TOUR_TYPE_I18N_KEYS, type TourType } from '@/features/tours/data/models/tour-type';
import type { TourSuggestion } from '@/features/tours/domain/entities/tour-suggestion';

import { useTourAttachmentsStore } from './stores/tour-attachments-store';
import { useTourSuggestionsStore } from './stores/tour-suggestions-store';
import { useTour } from './tour-detail-page';

type TFn = TFunction;

/** A suggested or current value as text: names for activities and seasons, never a storage key. */
function useFormatValue() {
  const { t } = useTranslation();
  const { formatDate, formatElevation } = useFormatter();
  const attachments = useTourAttachmentsStore((s) => s.attachmentsByTour);
  return (s: TourSuggestion, value: unknown, suggested: boolean): string => {
    const empty = t('tours.suggestions.emptyValue');
    const names = (types: unknown[]) =>
      types
        .map((v) => t(`tours.type.${TOUR_TYPE_I18N_KEYS[v as TourType]}` as 'tours.type.hiking'))
        .join(', ');
    if (s.field === 'gpx') {
      return value == null
        ? empty
        : suggested
          ? t('tours.suggestions.gpxNew')
          : t('tours.suggestions.gpxExisting');
    }
    if (s.field === 'attachment_remove') {
      if (suggested) return empty;
      const hit = (attachments[s.tourId] ?? []).find((a) => a.id === s.targetId);
      return hit?.originalFilename ?? t('tours.suggestions.anAttachment');
    }
    if (value == null) return empty;
    if (s.field === 'tour_type' && Array.isArray(value)) return value.length ? names(value) : empty;
    if (s.field === 'tour_type' && typeof value === 'object') {
      const { types, ascent, descent } = value as {
        types: unknown[];
        ascent?: unknown[];
        descent?: unknown[];
      };
      if (ascent && descent && ascent.join() !== descent.join())
        return `↑ ${names(ascent)} ↓ ${names(descent)}`;
      return types.length ? names(types) : empty;
    }
    if (s.field === 'seasons' && Array.isArray(value))
      return value.map((x) => t(`tours.season.${x}` as 'tours.season.winter')).join(', ');
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.join(', ');
    const obj = value as Record<string, unknown>;
    if ('plannedDate' in obj) {
      const day = (iso: unknown) =>
        iso ? formatDate(String(iso), { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;
      const from = day(obj.plannedDate);
      if (!from) return empty;
      const start = typeof obj.startTime === 'string' ? `${from} · ${obj.startTime}` : from;
      const to = day(obj.endDate);
      return to ? `${start} – ${to}` : start;
    }
    if ('lng' in obj && 'lat' in obj) {
      const name = typeof obj.name === 'string' && obj.name ? `${obj.name} · ` : '';
      const ele = obj.elevation != null ? ` · ${formatElevation(Number(obj.elevation))}` : '';
      return `${name}${Number(obj.lat).toFixed(4)}°N, ${Number(obj.lng).toFixed(4)}°E${ele}`;
    }
    if ('originalFilename' in obj) return String(obj.originalFilename);
    return empty;
  };
}

/**
 * Suggested changes on a tour (tour-suggestions): the owner reviews each batch (accept or decline
 * a field, accept all), the author sees their own open proposal (withdraw, revise); `history`
 * lists the resolved ones with their outcome. Writes need a connection.
 */
export function SuggestionsSheet({ tourId, history }: { tourId: string; history: boolean }) {
  const { t } = useTranslation();
  const tour = useTour(tourId);
  const me = useAuthStore((s) => s.user?.id ?? null);
  const suggestions = useTourSuggestionsStore((s) => s.suggestions);
  const format = useFormatValue();
  const [busy, setBusy] = useState(false);
  const isOwner = !!tour && !tour.isFriendTour;
  const store = useTourSuggestionsStore.getState();
  const batches = history ? store.resolvedBatchesFor(tourId) : store.pendingBatchesFor(tourId);
  const shown = isOwner ? batches : batches.filter((b) => b.suggesterId === me);
  void suggestions;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch {
      Alert.alert(useTourSuggestionsStore.getState().error ?? t('tours.infoSheet.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  const title = history ? t('tours.suggestions.historyTitle') : t('tours.suggestions.reviewTitle');
  return (
    <Screen>
      <Page title={title} onClose={() => router.back()}>
        {shown.length === 0 ? (
          <EmptyState
            icon="feedback"
            title={
              history
                ? t('tours.suggestions.historyEmpty')
                : isOwner
                  ? t('tours.suggestions.emptyOwner')
                  : t('tours.suggestions.emptyAuthor')
            }
          />
        ) : (
          shown.map((batch) => (
            <ListSection
              key={batch.batchId}
              title={
                batch.suggesterId === me
                  ? t('tours.suggestions.yourProposal')
                  : t('tours.suggestions.byAuthor', {
                      name: batch.suggesterName ?? t('tours.suggestions.aPartner'),
                    })
              }
            >
              {batch.rows.map((s) => (
                <SuggestionRow
                  key={s.id}
                  suggestion={s}
                  t={t}
                  format={format}
                  busy={busy}
                  owner={isOwner && !history}
                  author={!isOwner && !history}
                  onAccept={() => void run(() => store.accept(s))}
                  onDecline={() => void run(() => store.decline(s.id))}
                  onWithdraw={() => void run(() => store.withdraw(s.id))}
                />
              ))}
              {isOwner && !history && batch.rows.length > 1 ? (
                <ListRow
                  title={t('tours.suggestions.acceptAllBtn')}
                  icon="check_circle"
                  disabled={busy}
                  onPress={() => void run(() => store.acceptBatch(batch.batchId))}
                />
              ) : null}
              {!isOwner && !history ? (
                <ListRow
                  title={t('tours.suggestions.reviseBtn')}
                  icon="edit"
                  onPress={() =>
                    router.replace({ pathname: '/tour/edit', params: { id: tourId, suggest: '1' } })
                  }
                />
              ) : null}
            </ListSection>
          ))
        )}
      </Page>
    </Screen>
  );
}

function SuggestionRow({
  suggestion: s,
  t,
  format,
  busy,
  owner,
  author,
  onAccept,
  onDecline,
  onWithdraw,
}: {
  suggestion: TourSuggestion;
  t: TFn;
  format: ReturnType<typeof useFormatValue>;
  busy: boolean;
  owner: boolean;
  author: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
}) {
  const label = t(`tours.suggestions.fields.${s.field}` as 'tours.suggestions.fields.name');
  const subtitle = [
    `${t('tours.suggestions.originalValue')}: ${format(s, s.currentValue ?? s.baseValue, false)}`,
    s.isStale && s.status === 'pending' ? t('tours.suggestions.stale') : null,
    s.status !== 'pending'
      ? t(`tours.suggestions.status.${s.status}` as 'tours.suggestions.status.accepted')
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const actions = owner
    ? [
        { label: t('tours.suggestions.acceptBtn'), icon: 'check' as const, onPress: onAccept },
        {
          label: t('tours.suggestions.declineBtn'),
          icon: 'close' as const,
          destructive: true,
          onPress: onDecline,
        },
      ]
    : author
      ? [
          {
            label: t('tours.suggestions.withdrawBtn'),
            icon: 'undo' as const,
            destructive: true,
            onPress: onWithdraw,
          },
        ]
      : [];
  return (
    <ListRow
      title={`${label}: ${format(s, s.value, true)}`}
      subtitle={subtitle}
      icon={s.isStale && s.status === 'pending' ? 'warning' : 'feedback'}
      disabled={busy}
      menu={actions.length ? actions : undefined}
      leadingSwipeActions={owner ? [actions[0]!] : undefined}
      swipeActions={actions.length ? [actions.at(-1)!] : undefined}
    />
  );
}
