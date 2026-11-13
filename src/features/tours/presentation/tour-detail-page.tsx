import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, View } from 'react-native';

import { Icon } from '@/core/adaptive/icon';
import type { IconName } from '@/core/adaptive/icons';
import { ContentRow, EmptyState, ListRow, ListSection, ToggleRow } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { useFormatter } from '@/core/i18n/format';
import { color, radius, space } from '@/core/theme/tokens';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useFriendDisplayName } from '@/features/friendships/presentation/use-friend-display-name';
import { useMapStore } from '@/features/map/presentation/stores/map-store';
import type { Season } from '@/features/tours/data/models/season';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  TOUR_TYPE_ICONS,
  type TourType,
} from '@/features/tours/data/models/tour-type';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { landsByAir, legsApart, routeOrder } from '@/features/tours/domain/legs';
import { outingKey, outingSegments } from '@/features/tours/domain/outing';
import { tourMinutes } from '@/features/tours/domain/route-metrics';
import { usePace } from '@/features/user/presentation/stores/user-profile-store';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';

import { AttachmentsSection } from './attachments-section';
import { LinkedToursSection } from './linked-tours-section';
import { useRouteNumbers } from './route-numbers';
import { shareTourGpx } from './share-gpx';
import { useTourSuggestionsStore } from './stores/tour-suggestions-store';
import { useToursStore } from './stores/tours-store';
import { confirmDeleteTour } from './tours-sheet';

const useSessionUserId = () => useAuthStore((s) => s.user?.id ?? null);

const SEASON_ICONS: Record<Season, IconName> = {
  winter: 'ac_unit',
  spring: 'local_florist',
  summer: 'wb_sunny',
  autumn: 'eco',
};

const typeLabel = (t: TFunction, type: TourType) =>
  t(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}` as 'tours.type.hiking');

/** Finds a tour among the user's own and friends' tours. */
export function useTour(id: string): Tour | null {
  return useToursStore(
    (s) => s.tours.find((t) => t.id === id) ?? s.friendTours.find((t) => t.id === id) ?? null,
  );
}

/**
 * A tour's detail (tour-detail): the hero (activities, height, date, route numbers, owner), the
 * owner's switches (completed, visible to friends), the facts as rows (activities and grade,
 * seasons, start, end, track), partners, texts with tappable links, attachments, linked tours,
 * suggestions, the outing it belongs to, and Edit / Delete. Opening it frames the tour on the map
 * above the sheet; leaving it lets the map go back to all tours.
 */
export function TourDetailPage({
  id,
  onGone,
  onOpenOuting,
  onOpenTour,
  onClose,
}: {
  id: string;
  /** The tour is gone (deleted here or elsewhere): leave the page. */
  onGone: () => void;
  onOpenOuting: (key: string) => void;
  /** Another tour from this one (a linked tour). */
  onOpenTour: (id: string) => void;
  /** As a sheet's root: its close button. */
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { formatDate, formatDateRange, formatElevation } = useFormatter();
  const tour = useTour(id);
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const contacts = useContactsStore((s) => s.contacts);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const pace = usePace();
  const owner = useFriendDisplayName(tour?.isFriendTour ? tour.userId : null);
  const pendingCount = useTourSuggestionsStore((s) => s.pendingCountByTour[id] ?? 0);
  const me = useSessionUserId();
  const myPending = useTourSuggestionsStore(
    (s) =>
      s.suggestions.filter((x) => x.tourId === id && x.status === 'pending' && x.suggesterId === me)
        .length,
  );

  useEffect(() => {
    useMapStore.getState().selectTour(id);
    return () => {
      if (useMapStore.getState().selectedTourId === id) useMapStore.getState().selectTour(null);
    };
  }, [id]);

  const { metrics, numbers } = useRouteNumbers(tour, (m) =>
    tour ? tourMinutes(m, tour, pace) : null,
  );

  if (!tour) {
    return (
      <Page title={t('tours.infoSheet.unnamedTour')} onClose={onClose}>
        <EmptyState
          icon="search_off"
          title={t('tours.infoSheet.gone')}
          actionLabel={t('tours.infoSheet.backToTours')}
          onAction={onGone}
        />
      </Page>
    );
  }

  const isOwner = !tour.isFriendTour;
  const name = tour.name ?? t('tours.infoSheet.unnamedTour');
  const date = tour.plannedDate
    ? tour.endDate && tour.endDate.getTime() !== tour.plannedDate.getTime()
      ? formatDateRange(tour.plannedDate, tour.endDate, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : formatDate(tour.plannedDate, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
    : null;
  const when = [date, tour.startTime ?? null].filter(Boolean).join(' · ');

  const oneWay = !!tour.startPoint && !tour.endPoint;
  const roundTrip =
    !!tour.startPoint && !!tour.endPoint && isSameGoal(tour.startPoint, tour.endPoint);
  const landing = landsByAir(tour);
  const coords = (p: { lng: number; lat: number }) =>
    `${p.lat.toFixed(4)}°N, ${p.lng.toFixed(4)}°E`;
  const endValue = oneWay
    ? landing
      ? t('tours.infoSheet.landingOpen')
      : t('tours.infoSheet.oneWayToGoalIndicator')
    : roundTrip
      ? t('tours.infoSheet.roundTrip')
      : (tour.endPointName ?? (tour.endPoint ? coords(tour.endPoint) : ''));
  const endElevation = oneWay || roundTrip || !tour.endPointName ? null : tour.endPointElevation;
  const legs = legsApart(tour.legs);
  const typeGroups = legs
    ? [
        { way: 'up' as const, types: legs.ascent },
        { way: 'down' as const, types: legs.descent },
      ]
    : [{ way: null, types: tour.tourTypes }];

  const partners = isOwner
    ? tour.partnerIds
        .map((pid) => contacts.find((c) => c.id === pid))
        .filter((c) => c !== undefined)
    : [];
  const findContactByPhone = (phone: string) =>
    useContactsStore.getState().findContactByMethodValue('phone', phone);
  const friendPartners = !isOwner
    ? (tour.partnerNames ?? []).map((p) => ({
        id: p.userId,
        name:
          p.userId === me
            ? t('tours.infoSheet.partnerSelf')
            : (resolveFriendName(p.userId, phoneMap, findContactByPhone) ??
              [p.firstName, p.lastName].filter(Boolean).join(' ')),
      }))
    : [];
  const hiddenPartners = !isOwner ? (tour.unresolvedPartnerCount ?? 0) : 0;

  const key = outingKey(tour);
  const segments = outingSegments(isOwner ? tours : friendTours, key);
  const segmentIndex = segments.findIndex((s) => s.id === tour.id);
  const canSplit =
    isOwner &&
    segments.length === 0 &&
    !!tour.plannedDate &&
    !!tour.endDate &&
    tour.endDate > tour.plannedDate;

  const setCompleted = (completed: boolean) => {
    void useToursStore.getState().setCompleted(tour.id, completed);
    if (completed) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const hero = (
    <View style={styles.hero}>
      <View style={styles.discs}>
        {routeOrder(tour).map((type) => (
          <View key={type} style={[styles.disc, { backgroundColor: TOUR_TYPE_COLORS[type] }]}>
            <Icon name={TOUR_TYPE_ICONS[type] as IconName} color={color.onContrast} size={22} />
          </View>
        ))}
        {tour.tourTypes.length === 0 ? (
          <View style={[styles.disc, { backgroundColor: color.primary }]}>
            <Icon name="tour" color={color.onContrast} size={22} />
          </View>
        ) : null}
        {tour.completed ? (
          <View
            style={[styles.stamp, { backgroundColor: color.success }]}
            aria-label={t('tours.infoSheet.completedBtn')}
          >
            <Icon name="check" color={color.onContrast} size={14} />
          </View>
        ) : null}
        {tour.visibility === 'private' ? (
          <View
            style={[styles.stamp, { backgroundColor: color.onSurfaceVariant }]}
            aria-label={t('tours.form.visibilityPrivate')}
          >
            <Icon name="lock" color={color.onContrast} size={14} />
          </View>
        ) : null}
      </View>
      <Text variant="title" role="heading" selectable>
        {name}
      </Text>
      {tour.elevation != null || when ? (
        <Text style={styles.headline}>
          {[tour.elevation != null ? formatElevation(tour.elevation) : null, when || null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      {numbers ? (
        <Text style={styles.numbers} aria-label={numbers.label}>
          {numbers.text}
        </Text>
      ) : null}
      {tour.isFriendTour ? (
        <Text style={styles.meta}>
          {owner.isResolved
            ? t('tours.infoSheet.createdByLabel', { name: owner.displayName ?? '' })
            : ' '}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Page
      title={name}
      onClose={onClose}
      header={hero}
      // The track is shared from its row under Route; the bar says in a word what it does.
      actions={[
        ...(isOwner
          ? [
              {
                id: 'edit',
                label: t('tours.infoSheet.editBtn'),
                icon: 'edit' as const,
                titled: true,
                onPress: () => router.push({ pathname: '/tour/edit', params: { id: tour.id } }),
              },
            ]
          : []),
      ]}
    >
      {isOwner ? (
        // Who sees the tour is the section's footer, where it wraps in full (a switch row's
        // second line is cut at two).
        <ListSection
          footer={
            tour.visibility === 'private'
              ? t('tours.form.visibilityPrivateHint')
              : t('tours.form.visibilityFriendsHint')
          }
        >
          <ToggleRow
            title={t('tours.infoSheet.completedBtn')}
            icon={tour.completed ? 'check_circle' : 'radio_button_unchecked'}
            value={!!tour.completed}
            onValueChange={setCompleted}
          />
          <ToggleRow
            title={t('tours.infoSheet.visibleToFriends')}
            icon={tour.visibility === 'private' ? 'lock' : 'group'}
            value={tour.visibility !== 'private'}
            onValueChange={(visible) =>
              void useToursStore.getState().setVisibility(tour.id, visible ? 'friends' : 'private')
            }
          />
        </ListSection>
      ) : tour.completed ? (
        <ListSection>
          <ListRow
            title={t('tours.infoSheet.completedBtn')}
            icon={tour.completed ? 'check_circle' : 'radio_button_unchecked'}
            iconColor={color.success}
          />
        </ListSection>
      ) : null}

      {segments.length > 0 ? (
        <ListSection>
          <ListRow
            title={t('tours.outing.segmentOf', { n: segmentIndex + 1, count: segments.length })}
            subtitle={segments[0]?.outing?.name ?? undefined}
            icon="timeline"
            onPress={() => onOpenOuting(key!)}
          />
        </ListSection>
      ) : null}

      <LinkedToursSection tour={tour} onOpenTour={onOpenTour} />

      <ListSection>
        {typeGroups.flatMap((group) =>
          group.types.map((type, i) => (
            <ListRow
              key={`${group.way ?? 'all'}-${type}`}
              title={typeLabel(t, type)}
              subtitle={
                group.way && i === 0
                  ? group.way === 'up'
                    ? t('tours.infoSheet.wayUp')
                    : t('tours.infoSheet.wayDown')
                  : undefined
              }
              icon={TOUR_TYPE_ICONS[type] as IconName}
              iconColor={TOUR_TYPE_COLORS[type]}
              value={i === 0 && group.way !== 'down' ? (tour.grade ?? undefined) : undefined}
            />
          )),
        )}
        {tour.tourTypes.length === 0 && tour.grade ? (
          <ListRow title={t('tours.filters.gradeLabel')} value={tour.grade} icon="speed" />
        ) : null}
        {tour.seasons?.length ? (
          <ListRow
            title={tour.seasons.map((s) => t(`tours.season.${s}`)).join(', ')}
            icon={SEASON_ICONS[tour.seasons[0]!]}
            accessibilityLabel={`${t('tours.infoSheet.iconTooltipSeasons')}: ${tour.seasons
              .map((s) => t(`tours.season.${s}`))
              .join(', ')}`}
          />
        ) : null}
      </ListSection>

      {tour.startPoint || tour.endPoint || tour.gpxFilepath ? (
        <ListSection>
          {tour.startPoint ? (
            <ListRow
              title={tour.startPointName ?? coords(tour.startPoint)}
              subtitle={t('tours.infoSheet.startShort')}
              value={
                tour.startPointName && tour.startPointElevation != null
                  ? formatElevation(tour.startPointElevation)
                  : undefined
              }
              icon="trip_origin"
            />
          ) : null}
          {tour.startPoint || tour.endPoint ? (
            // The route as planned: Start, Ziel, Ende; a one-way tour simply ends at the goal.
            <ListRow
              title={name}
              subtitle={t('tours.form.goalLabel')}
              value={tour.elevation != null ? formatElevation(tour.elevation) : undefined}
              icon="flag"
            />
          ) : null}
          {tour.endPoint || (oneWay && landing) ? (
            <ListRow
              title={endValue}
              subtitle={landing ? t('tours.infoSheet.landingShort') : t('tours.infoSheet.endShort')}
              value={endElevation != null ? formatElevation(endElevation) : undefined}
              icon="sports_score"
            />
          ) : null}
          {tour.gpxFilepath ? (
            <ListRow
              title={t('tours.infoSheet.gpxTrackAvailable')}
              subtitle={metrics.distance ? numbers?.text : undefined}
              icon="route"
              onPress={() => void shareTourGpx(tour)}
              chevron={false}
              contextActions={[
                {
                  label: t('tours.infoSheet.downloadGpxBtn'),
                  icon: 'download',
                  onPress: () => void shareTourGpx(tour),
                },
              ]}
            />
          ) : null}
        </ListSection>
      ) : null}

      {partners.length > 0 || friendPartners.length > 0 || hiddenPartners > 0 ? (
        <ListSection title={t('tours.infoSheet.iconTooltipPartners')}>
          {partners.map((contact) => (
            <ListRow
              key={contact.id}
              title={resolveContactName(contact)}
              icon="person"
              onPress={() => router.push({ pathname: '/contact/[id]', params: { id: contact.id } })}
            />
          ))}
          {friendPartners.map((p) => (
            <ListRow key={p.id} title={p.name || t('tours.suggestions.aPartner')} icon="person" />
          ))}
          {hiddenPartners > 0 ? (
            <ListRow
              title={t('tours.infoSheet.morePartners', { count: hiddenPartners })}
              icon="group"
            />
          ) : null}
        </ListSection>
      ) : null}

      <TextSection title={t('tours.form.descriptionLabel')} text={tour.description} />
      <TextSection title={t('tours.form.equipmentLabel')} text={tour.equipment} />
      <TextSection title={t('tours.form.notesLabel')} text={tour.notes} />

      <AttachmentsSection tourId={tour.id} editable={isOwner} />

      {isOwner && pendingCount > 0 ? (
        <ListSection>
          <ListRow
            title={t('tours.suggestions.pendingCount', { count: pendingCount })}
            icon="feedback"
            badge={pendingCount}
            onPress={() => router.push({ pathname: '/tour/suggestions', params: { id: tour.id } })}
          />
          <ListRow
            title={t('tours.suggestions.historyBtn')}
            icon="schedule"
            onPress={() =>
              router.push({ pathname: '/tour/suggestions', params: { id: tour.id, history: '1' } })
            }
          />
        </ListSection>
      ) : null}
      {!isOwner && tour.isPartner ? (
        <ListSection>
          {myPending > 0 ? (
            <ListRow
              title={t('tours.suggestions.yourPendingCount', { count: myPending })}
              icon="feedback"
              onPress={() =>
                router.push({ pathname: '/tour/suggestions', params: { id: tour.id } })
              }
            />
          ) : (
            <ListRow
              title={t('tours.suggestions.suggestBtn')}
              icon="edit"
              onPress={() =>
                router.push({ pathname: '/tour/edit', params: { id: tour.id, suggest: '1' } })
              }
            />
          )}
          <ListRow
            title={t('tours.suggestions.historyBtn')}
            icon="schedule"
            onPress={() =>
              router.push({ pathname: '/tour/suggestions', params: { id: tour.id, history: '1' } })
            }
          />
        </ListSection>
      ) : null}

      {isOwner ? (
        <ListSection>
          <ListRow
            title={t('tours.infoSheet.editBtn')}
            icon="edit"
            onPress={() => router.push({ pathname: '/tour/edit', params: { id: tour.id } })}
          />
          {canSplit ? (
            <ListRow
              title={t('tours.form.splitDaysBtn')}
              icon="calendar_view_day"
              onPress={() => void splitDays(tour, onOpenOuting)}
            />
          ) : (
            <ListRow
              title={t('tours.outing.addSegment')}
              icon="add_road"
              onPress={() =>
                router.push({ pathname: '/tour/add-segment', params: { id: tour.id } })
              }
            />
          )}
          <ListRow
            title={t('tours.infoSheet.deleteBtn')}
            icon="delete"
            destructive
            onPress={() => confirmDeleteTour(t, tour.id, onGone)}
          />
        </ListSection>
      ) : null}
    </Page>
  );
}

/** A multi-day tour becomes an outing of daily stages; the page then shows the outing. */
async function splitDays(tour: Tour, onOpenOuting: (key: string) => void) {
  const outing = await useToursStore.getState().ensureOuting(tour.id);
  if (!outing) return;
  await useToursStore.getState().keepFirstDay(tour.id);
  const key = outingKey({ userId: tour.userId, outing });
  if (key) onOpenOuting(key);
}

const URL_PATTERN = /https?:\/\/[^\s<>[\]{}|\\^`"]+/g;

/** Free text with its links tappable (tour-detail "Description with links"). */
function TextSection({ title, text }: { title: string; text: string | null | undefined }) {
  if (!text?.trim()) return null;
  const parts: { text: string; url?: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: match[0], url: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return (
    <ListSection title={title}>
      <ContentRow>
        <Text selectable style={styles.body}>
          {parts.map((part, i) =>
            part.url ? (
              <Text
                key={i}
                role="link"
                style={styles.link}
                onPress={() => void Linking.openURL(part.url!)}
              >
                {part.text}
              </Text>
            ) : (
              part.text
            ),
          )}
        </Text>
      </ContentRow>
    </ListSection>
  );
}

const styles = StyleSheet.create({
  hero: { gap: space.xxs, paddingVertical: space.xs },
  discs: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, marginBottom: space.xxs },
  disc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: { color: color.onSurface },
  numbers: { color: color.onSurfaceVariant, fontVariant: ['tabular-nums'] },
  meta: { color: color.primary },
  body: { color: color.onSurface, paddingVertical: space.xs },
  link: { color: color.primary, textDecorationLine: 'underline' },
});
