import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import type { IconName } from '@/core/adaptive/icons';
import { DateRow, ListRow, ListSection, PickerRow, TextRow } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import { sessionUser } from '@/core/auth/session-user';
import { newId, readText } from '@/core/files';
import { useFormatter } from '@/core/i18n/format';
import { createLogger } from '@/core/logging/logger';
import { isOnline } from '@/core/offline/online';
import { stageText } from '@/core/offline/staged-files';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { lineLength } from '@/features/map/domain/drawn-track';
import type { LngLat } from '@/features/map/domain/entities/trail';
import { gradeScales, toggleGrade, gradeLeads } from '@/features/tours/data/models/grade';
import { SEASON_VALUES, type Season } from '@/features/tours/data/models/season';
import {
  TOUR_TYPE_COLORS,
  TOUR_TYPE_I18N_KEYS,
  TOUR_TYPE_ICONS,
  TOUR_TYPE_VALUES,
  type TourType,
} from '@/features/tours/data/models/tour-type';
import { GpxFileTooLargeError, parseGpxText } from '@/features/tours/data/services/gpx-parser';
import { gpxStorageKey, uploadGpxToKey } from '@/features/tours/data/services/gpx-storage-service';
import type { TourDraft } from '@/features/tours/domain/entities/tour';
import {
  defaultDirection,
  directionOf,
  legsFrom,
  waysCovered,
  type LegDirection,
} from '@/features/tours/domain/legs';
import { trackLines } from '@/features/tours/domain/route-metrics';
import { buildSuggestionItems } from '@/features/tours/domain/suggestion-diff';

import { AttachmentsSection, usePickActions } from './attachments-section';
import { useTourAttachmentsStore } from './stores/tour-attachments-store';
import { useTourDraftStore } from './stores/tour-draft-store';
import { useTourSuggestionsStore } from './stores/tour-suggestions-store';
import { useToursStore } from './stores/tours-store';
import { useTour } from './tour-detail-page';
import { useMapStore } from '@/features/map/presentation/stores/map-store';
import type { Contact } from '@/features/contacts/domain/entities/contact';

const log = createLogger('TourForm');
const GPX_MAX_BYTES = 2 * 1024 * 1024;

const typeLabel = (t: TFunction, type: TourType) =>
  t(`tours.type.${TOUR_TYPE_I18N_KEYS[type]}` as 'tours.type.hiking');

/**
 * The tour form (tour-form-extended), a full-screen system form with Cancel and Save: name,
 * activities (and, with several, which way each goes), grade, dates and start time, the route (its
 * points; "Change route" and "Draw on map" open the step over the live map and come back here with
 * every field kept), the track (import a GPX file, remove), height, seasons, partners, visibility,
 * texts and attachments. Create, edit and (a partner on a friend's tour) suggest changes.
 */
export function TourFormScreen() {
  const { t } = useTranslation();
  const [path, setPath] = useState<string[]>([]);
  return (
    <Screen
      path={path}
      onPathChange={setPath}
      renderPage={(value) =>
        value === 'activities' ? (
          <ActivitiesPage />
        ) : value === 'grade' ? (
          <GradePage />
        ) : value === 'seasons' ? (
          <ChecklistPage
            title={t('tours.form.seasonLabel')}
            options={SEASON_VALUES.map((s: Season) => ({
              value: s,
              label: t(`tours.season.${s}`),
            }))}
            selected={useTourDraftStore.getState().draft.seasons ?? []}
            onChange={(seasons) =>
              useTourDraftStore.getState().update({ seasons: seasons as Season[] })
            }
          />
        ) : value === 'partners' ? (
          <PartnersPage />
        ) : null
      }
    >
      <FormPage onPush={(v) => setPath((p) => [...p, v])} />
    </Screen>
  );
}

function FormPage({ onPush }: { onPush: (value: string) => void }) {
  const { t } = useTranslation();
  const { formatElevation, formatDistance } = useFormatter();
  const mode = useTourDraftStore((s) => s.mode) ?? 'create';
  const tourId = useTourDraftStore((s) => s.tourId);
  const draftId = useTourDraftStore((s) => s.draftId);
  const draft = useTourDraftStore((s) => s.draft);
  const goal = useTourDraftStore((s) => s.goal);
  const track = useTourDraftStore((s) => s.track);
  const gpxRemoved = useTourDraftStore((s) => s.gpxRemoved);
  const dirty = useTourDraftStore((s) => s.dirty);
  const contacts = useContactsStore((s) => s.contacts);
  const original = useTour(tourId ?? '');
  const pending = useTourAttachmentsStore((s) => (tourId ? s.pendingByTour[tourId] : undefined));
  const preUploaded = useTourAttachmentsStore((s) => s.preUploadedByDraft[draftId]);
  const staged = useTourAttachmentsStore((s) => s.stagedByDraft[draftId]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const store = useTourDraftStore.getState();
  const update = store.update;

  const uploading = (pending ?? []).some((p) => p.status === 'uploading');
  const pickAttachments = usePickActions((files) => {
    const attachments = useTourAttachmentsStore.getState();
    if (mode === 'create') void attachments.preUpload(draftId, tourId!, files);
    else if (mode === 'suggest')
      attachments.stage(
        draftId,
        files,
        (original ? attachments.attachmentsByTour[original.id]?.length : 0) ?? 0,
      );
  }, 5);

  const title =
    mode === 'create'
      ? t('tours.creation.title')
      : mode === 'suggest'
        ? t('tours.suggestions.suggestTitle')
        : t('tours.infoSheet.editTitle');

  function close() {
    const finish = () => {
      void useTourAttachmentsStore
        .getState()
        .discardDraft(draftId, mode === 'create' ? tourId : null);
      useTourDraftStore.getState().reset();
      router.back();
    };
    if (!dirty && !(preUploaded?.length || staged?.length)) {
      finish();
      return;
    }
    Alert.alert(t('tours.form.discardTitle'), undefined, [
      { text: t('tours.creation.keepEditing'), style: 'cancel' },
      { text: t('contacts.shared.discardBtn'), style: 'destructive', onPress: finish },
    ]);
  }

  async function uploadTrack(text: string): Promise<string | null> {
    const userId = sessionUser.getState().id;
    if (!userId) return null;
    if (mode === 'suggest') {
      const key = `${userId}/suggestions/${tourId}/${newId()}.gpx`;
      await uploadGpxToKey(key, new Blob([text], { type: 'application/gpx+xml' }));
      return key;
    }
    const key = gpxStorageKey(userId, newId());
    if (isOnline()) await uploadGpxToKey(key, new Blob([text], { type: 'application/gpx+xml' }));
    // Offline: staged under its key, shown at once, uploaded before the row on replay.
    else await stageText(key, text);
    return key;
  }

  async function save() {
    if (!draft.name?.trim()) {
      setNameError(t('tours.form.nameRequired'));
      return;
    }
    if (!goal) return;
    if (draft.endDate && draft.plannedDate && draft.endDate < draft.plannedDate) return;
    setSaving(true);
    let created: string | null = null;
    try {
      const next: TourDraft = { ...draft, name: draft.name.trim() };
      if (track) next.gpxFilepath = await uploadTrack(track.text);
      else if (gpxRemoved) next.gpxFilepath = null;
      const tours = useToursStore.getState();

      if (mode === 'create') {
        const duplicate = await tours.dropIfDuplicate(next, goal);
        if (duplicate) {
          Alert.alert(t('tours.creation.alreadyThere'));
          useTourDraftStore.getState().reset();
          router.back();
          return;
        }
        const id = await tours.createTourFromDraft(next, goal, tourId);
        created = id ?? null;
        if (id) {
          await useTourAttachmentsStore.getState().commitStaged(draftId, id);
          const anchor = useTourDraftStore.getState().segmentOf;
          if (anchor) await tours.addToOuting(anchor, id);
        }
      } else if (mode === 'edit' && tourId) {
        await tours.updateTour(tourId, next, goal, gpxRemoved);
      } else if (mode === 'suggest' && original) {
        const attachments = useTourAttachmentsStore.getState();
        const added = await Promise.all(
          (attachments.stagedByDraft[draftId] ?? []).map(async (file) => ({
            id: newId(),
            storagePath: await useTourSuggestionsStore
              .getState()
              .uploadStaged('tour-attachments', original.id, file),
            mimeType: file.type,
            sizeBytes: file.size,
            originalFilename: file.name,
          })),
        );
        const items = buildSuggestionItems(original, next, goal, { addedAttachments: added });
        if (items.length) {
          await useTourSuggestionsStore.getState().submitBatch(original.id, newId(), items);
        }
        attachments.clearStaged(draftId);
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      useTourDraftStore.getState().reset();
      router.back();
      // A new tour opens on the map, as in the PWA: it is there, and what to do next is at hand.
      if (created) openTourSheet(created);
    } catch (error) {
      log.error('Save failed', error);
      Alert.alert(t('tours.infoSheet.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function importGpx() {
    setGpxError(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/gpx+xml', 'application/xml', 'text/xml', 'public.xml', '*/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0]!;
    try {
      if ((asset.size ?? 0) > GPX_MAX_BYTES) throw new GpxFileTooLargeError();
      const text = await readText(asset);
      const geojson = parseGpxText(text);
      const line = trackLines(geojson)
        .flat()
        .map(([lng, lat]) => [lng!, lat!] as LngLat);
      if (line.length < 2) throw new Error('empty track');
      store.setTrack({ text, label: asset.name, line, drawing: null });
      // Its ends set the route's start and end when the form has none.
      if (!draft.startPoint) {
        update({
          startPoint: { lng: line[0]![0], lat: line[0]![1] },
          endPoint: { lng: line.at(-1)![0], lat: line.at(-1)![1] },
        });
      }
    } catch (error) {
      setGpxError(
        error instanceof GpxFileTooLargeError
          ? t('tours.form.gpxTooLarge')
          : t('tours.form.gpxInvalid'),
      );
    }
  }

  const types = draft.tourTypes;
  const scales = gradeScales(types);
  const partners = draft.partnerIds
    .map((id) => contacts.find((c) => c.id === id))
    .filter((c) => c !== undefined)
    .map(resolveContactName);
  const suggested = useSuggestedPartners(draft.partnerIds);
  const hasTrack = !!track || (!!draft.gpxFilepath && !gpxRemoved);
  const trackLabel = track
    ? track.label
    : hasTrack
      ? t('tours.form.gpxExistingTrack')
      : t('tours.form.gpxTrackNone');
  const point = (
    p: { lng: number; lat: number } | null,
    name: string | null,
    ele: number | null,
  ) =>
    p
      ? (name ?? `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`) +
        (ele != null ? ` · ${formatElevation(ele)}` : '')
      : t('tours.form.pointNotSet');

  return (
    <Page
      form
      title={title}
      cancel={{ label: t('common.cancel'), onPress: close }}
      confirm={{
        label:
          mode === 'suggest' ? t('tours.suggestions.submitBtn') : t('tours.infoSheet.saveLabel'),
        onPress: () => void save(),
        disabled: saving || uploading || !goal || !draft.name?.trim(),
      }}
    >
      <ListSection>
        <TextRow
          label={t('tours.form.nameLabel')}
          placeholder={t('tours.form.namePlaceholder')}
          value={draft.name ?? ''}
          onChangeText={(name) => {
            setNameError(null);
            update({ name });
          }}
          autoCapitalize="words"
          error={nameError ?? undefined}
        />
        <ListRow
          title={t('tours.form.activityLabel')}
          value={types.length ? types.map((type) => typeLabel(t, type)).join(', ') : undefined}
          icon={types[0] ? (TOUR_TYPE_ICONS[types[0]] as IconName) : 'tour'}
          iconColor={types[0] ? TOUR_TYPE_COLORS[types[0]] : undefined}
          // One activity is two taps from a menu, as a chip was one in the PWA; several open the
          // checklist with their ways up and down.
          menu={
            types.length > 1
              ? undefined
              : [
                  ...TOUR_TYPE_VALUES.map((type) => ({
                    label: typeLabel(t, type),
                    icon: (types[0] === type ? 'check' : TOUR_TYPE_ICONS[type]) as IconName,
                    onPress: () => {
                      update({
                        tourTypes: [type],
                        legs: legsFrom([type], (x) => defaultDirection(x, [type])),
                      });
                      void Haptics.selectionAsync();
                    },
                  })),
                  {
                    label: t('tours.form.severalActivities'),
                    icon: 'add' as IconName,
                    onPress: () => onPush('activities'),
                  },
                ]
          }
          onPress={types.length > 1 ? () => onPush('activities') : undefined}
        />
        {scales.length === 1 ? null : (
          <ListRow
            title={t('tours.filters.gradeLabel')}
            value={draft.grade ?? t('tours.form.gradeOptional')}
            icon="speed"
            onPress={() => onPush('grade')}
          />
        )}
      </ListSection>
      {scales.length === 1 ? (
        // The activity's scale inline: a grade is one tap; modifiers and other scales are typed.
        <ListSection
          title={t('tours.form.gradeLabel')}
          footer={draft.grade && !scales[0]!.grades.includes(draft.grade) ? draft.grade : undefined}
        >
          <PickerRow
            title={t('tours.form.gradeLabel')}
            style="segmented"
            value={gradeLeads(draft.grade ?? '')[0] ?? ''}
            options={scales[0]!.grades.map((g) => ({ value: g, label: g }))}
            onChange={(grade) => {
              update({ grade });
              void Haptics.selectionAsync();
            }}
          />
          <ListRow title={t('tours.form.gradeMore')} icon="edit" onPress={() => onPush('grade')} />
        </ListSection>
      ) : null}

      <ListSection
        title={t('tours.form.whenSectionLabel')}
        footer={draft.endDate ? t('tours.form.multiDayHint') : undefined}
      >
        <DateRow
          title={t('tours.form.plannedDateLabel')}
          value={draft.plannedDate}
          placeholder={t('tours.form.pointNotSet')}
          onChange={(plannedDate) => {
            const day = utcDay(plannedDate);
            update({
              plannedDate: day,
              endDate: draft.endDate && draft.endDate < day ? null : draft.endDate,
            });
          }}
          onClear={() => update({ plannedDate: null, endDate: null, startTime: null })}
          clearLabel={t('tours.form.gpxRemoveBtn')}
        />
        {draft.plannedDate ? (
          <DateRow
            title={t('tours.form.endDateLabel')}
            value={draft.endDate}
            minimumDate={draft.plannedDate}
            placeholder={t('tours.form.pointNotSet')}
            onChange={(endDate) => update({ endDate: utcDay(endDate) })}
            onClear={() => update({ endDate: null })}
            clearLabel={t('tours.form.gpxRemoveBtn')}
          />
        ) : null}
        {draft.plannedDate ? (
          <DateRow
            mode="time"
            title={t('tours.form.startTimeLabel')}
            value={draft.startTime ? timeOf(draft.startTime) : null}
            placeholder={t('tours.form.pointNotSet')}
            onChange={(time) =>
              update({
                startTime: `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`,
              })
            }
            onClear={() => update({ startTime: null })}
            clearLabel={t('tours.form.gpxRemoveBtn')}
          />
        ) : null}
      </ListSection>

      <ListSection title={t('tours.form.routeSectionLabel')} footer={gpxError ?? undefined}>
        <ListRow
          title={point(draft.startPoint, draft.startPointName, draft.startPointElevation)}
          subtitle={t('tours.form.startPointLabel')}
          icon="trip_origin"
          chevron={false}
        />
        <ListRow
          title={
            goal
              ? draft.name?.trim() || `${goal.lat.toFixed(4)}, ${goal.lng.toFixed(4)}`
              : t('tours.form.pointNotSet')
          }
          subtitle={t('tours.form.goalLabel')}
          value={draft.elevation != null ? formatElevation(draft.elevation) : undefined}
          icon="flag"
          chevron={false}
        />
        <ListRow
          title={point(draft.endPoint, draft.endPointName, draft.endPointElevation)}
          subtitle={t('tours.form.endPointLabel')}
          icon="sports_score"
          chevron={false}
        />
        <ListRow
          title={t('tours.form.changeRouteBtn')}
          icon="edit"
          onPress={() => router.replace({ pathname: '/plan', params: { back: '1' } })}
        />
        <ListRow
          title={trackLabel}
          subtitle={track?.line ? formatDistance(lineLength(track.line)) : t('tours.form.gpxLabel')}
          icon="route"
          menu={[
            {
              label: hasTrack ? t('tours.form.gpxEditBtn') : t('tours.form.gpxDrawBtn'),
              icon: 'draw',
              onPress: () => router.replace({ pathname: '/draw', params: { back: '1' } }),
            },
            {
              label: hasTrack ? t('tours.form.gpxReplaceTooltip') : t('tours.form.gpxUploadBtn'),
              icon: 'upload_file',
              onPress: () => void importGpx(),
            },
            ...(hasTrack
              ? [
                  {
                    label: t('tours.form.gpxRemoveTooltip'),
                    icon: 'delete' as const,
                    destructive: true,
                    onPress: () => store.removeTrack(),
                  },
                ]
              : []),
          ]}
        />
      </ListSection>

      <ListSection title={t('tours.form.detailSectionLabel')}>
        <TextRow
          label={t('tours.form.elevationLabel')}
          placeholder={t('tours.form.elevationPlaceholder')}
          keyboardType="numeric"
          value={draft.elevation != null ? String(draft.elevation) : ''}
          onChangeText={(text) => {
            const n = Number.parseInt(text.replace(/\D/g, ''), 10);
            update({ elevation: Number.isFinite(n) ? n : null });
          }}
        />
        <ListRow
          title={t('tours.form.seasonLabel')}
          value={
            draft.seasons?.length
              ? draft.seasons.map((s) => t(`tours.season.${s}`)).join(', ')
              : undefined
          }
          icon="eco"
          onPress={() => onPush('seasons')}
        />
        {mode !== 'suggest' && suggested.length === 0 ? (
          <ListRow
            title={t('tours.form.partnersLabel')}
            value={partners.length ? partners.join(', ') : undefined}
            icon="group"
            onPress={() => onPush('partners')}
          />
        ) : null}
      </ListSection>

      {mode !== 'suggest' && suggested.length ? (
        // Who comes along is a tap per person, as the PWA's chips: the people most often along
        // first, the rest of the contacts one row further.
        <ListSection title={t('tours.form.partnersLabel')}>
          {suggested.map((contact) => (
            <ListRow
              key={contact.id}
              title={resolveContactName(contact)}
              icon="person"
              checked={draft.partnerIds.includes(contact.id)}
              chevron={false}
              onPress={() => {
                update({
                  partnerIds: draft.partnerIds.includes(contact.id)
                    ? draft.partnerIds.filter((id) => id !== contact.id)
                    : [...draft.partnerIds, contact.id],
                });
                void Haptics.selectionAsync();
              }}
            />
          ))}
          {contacts.length > suggested.length ? (
            <ListRow
              title={t('tours.form.allContacts')}
              value={
                partners.length > suggested.filter((c) => draft.partnerIds.includes(c.id)).length
                  ? partners.join(', ')
                  : undefined
              }
              icon="group"
              onPress={() => onPush('partners')}
            />
          ) : null}
        </ListSection>
      ) : null}

      {mode !== 'suggest' ? (
        <ListSection
          title={t('tours.form.visibilityLabel')}
          footer={
            draft.visibility === 'private'
              ? t('tours.form.visibilityPrivateHint')
              : t('tours.form.visibilityFriendsHint')
          }
        >
          <PickerRow
            title={t('tours.form.visibilityLabel')}
            style="segmented"
            value={draft.visibility ?? 'friends'}
            onChange={(visibility) => update({ visibility })}
            options={[
              { value: 'friends', label: t('tours.form.visibilityFriends') },
              { value: 'private', label: t('tours.form.visibilityPrivate') },
            ]}
          />
        </ListSection>
      ) : null}

      <ListSection title={t('tours.form.descriptionLabel')}>
        <TextRow
          label={t('tours.form.descriptionLabel')}
          placeholder={t('tours.form.descriptionPlaceholder')}
          multiline
          value={draft.description ?? ''}
          onChangeText={(description) => update({ description: description || null })}
        />
      </ListSection>
      <ListSection title={t('tours.form.equipmentLabel')}>
        <TextRow
          label={t('tours.form.equipmentLabel')}
          placeholder={t('tours.form.equipmentPlaceholder')}
          multiline
          value={draft.equipment ?? ''}
          onChangeText={(equipment) => update({ equipment: equipment || null })}
        />
      </ListSection>
      <ListSection title={t('tours.form.notesLabel')}>
        <TextRow
          label={t('tours.form.notesLabel')}
          placeholder={t('tours.form.notesPlaceholder')}
          multiline
          value={draft.notes ?? ''}
          onChangeText={(notes) => update({ notes: notes || null })}
        />
      </ListSection>

      {mode === 'edit' && tourId ? (
        <AttachmentsSection tourId={tourId} editable />
      ) : (
        <DraftAttachments draftId={draftId} tourId={tourId} pickActions={pickAttachments} />
      )}
    </Page>
  );
}

/** Files picked in the create or suggest flow: uploading (create) or waiting (suggest). */
function DraftAttachments({
  draftId,
  tourId,
  pickActions,
}: {
  draftId: string;
  tourId: string | null;
  pickActions: ReturnType<typeof usePickActions>;
}) {
  const { t } = useTranslation();
  const pending = useTourAttachmentsStore((s) => (tourId ? s.pendingByTour[tourId] : undefined));
  const done = useTourAttachmentsStore((s) => s.preUploadedByDraft[draftId]);
  const staged = useTourAttachmentsStore((s) => s.stagedByDraft[draftId]);
  const error = useTourAttachmentsStore((s) => s.error);
  const rows = [
    ...(done ?? []).map((f) => ({
      id: f.id,
      name: f.originalFilename,
      status: null as string | null,
    })),
    ...(staged ?? []).map((f, i) => ({ id: `staged-${i}`, name: f.name, status: null })),
    ...(pending ?? [])
      .filter((p) => p.draftId === draftId)
      .map((p) => ({
        id: p.id,
        name: p.filename,
        status:
          p.status === 'failed'
            ? t('tours.attachments.uploadFailed')
            : `${t('tours.attachments.uploading')} ${Math.round(p.progress * 100)} %`,
      })),
  ];
  return (
    <ListSection title={t('tours.form.attachmentsSectionLabel')} footer={error ?? undefined}>
      {rows.map((row) => (
        <ListRow
          key={row.id}
          title={row.name}
          subtitle={row.status ?? undefined}
          icon="attach_file"
        />
      ))}
      {rows.length < 5 ? (
        <ListRow title={t('tours.attachments.add')} icon="attach_file" menu={pickActions} />
      ) : null}
    </ListSection>
  );
}

/** Activities as a checklist; with several, which way each goes (activity-legs). */
function ActivitiesPage() {
  const { t } = useTranslation();
  const draft = useTourDraftStore((s) => s.draft);
  const update = useTourDraftStore.getState().update;
  const types = draft.tourTypes;
  const direction = (type: TourType): LegDirection =>
    draft.legs ? directionOf(draft.legs, type) : defaultDirection(type, types);

  function toggle(type: TourType) {
    const next = TOUR_TYPE_VALUES.filter((v) =>
      v === type ? !types.includes(v) : types.includes(v),
    );
    // Ways reset to their defaults when the activities change.
    update({ tourTypes: next, legs: legsFrom(next, (x) => defaultDirection(x, next)) });
    void Haptics.selectionAsync();
  }

  function setDirection(type: TourType, way: LegDirection) {
    const pick = (x: TourType) => (x === type ? way : direction(x));
    if (!waysCovered(types, pick)) return;
    update({ legs: legsFrom(types, pick) });
  }

  return (
    <Page title={t('tours.form.activityLabel')}>
      <ListSection>
        {TOUR_TYPE_VALUES.map((type) => (
          <ListRow
            key={type}
            title={typeLabel(t, type)}
            icon={TOUR_TYPE_ICONS[type] as IconName}
            iconColor={TOUR_TYPE_COLORS[type]}
            checked={types.includes(type)}
            chevron={false}
            onPress={() => toggle(type)}
          />
        ))}
      </ListSection>
      {types.length > 1 ? (
        <ListSection title={t('tours.form.legs.label')} footer={t('tours.form.legs.hint')}>
          {types.map((type) => (
            <PickerRow<LegDirection>
              key={type}
              title={typeLabel(t, type)}
              icon={TOUR_TYPE_ICONS[type] as IconName}
              value={direction(type)}
              onChange={(way) => setDirection(type, way)}
              options={[
                { value: 'up', label: t('tours.form.legs.up') },
                { value: 'both', label: t('tours.form.legs.both') },
                { value: 'down', label: t('tours.form.legs.down') },
              ]}
            />
          ))}
        </ListSection>
      ) : null}
    </Page>
  );
}

/** The grade: chips per scale of the chosen activities, or free text. */
function GradePage() {
  const { t } = useTranslation();
  const draft = useTourDraftStore((s) => s.draft);
  const update = useTourDraftStore.getState().update;
  const scales = gradeScales(draft.tourTypes);
  const grade = draft.grade ?? '';
  const chosen = new Set(grade ? gradeLeads(grade) : []);
  return (
    <Page title={t('tours.filters.gradeLabel')}>
      <ListSection>
        <TextRow
          label={t('tours.form.gradeLabel')}
          placeholder={t('tours.form.gradePlaceholder', { example: scales[0]?.grades[2] ?? 'T4' })}
          value={grade}
          maxLength={20}
          onChangeText={(text) => update({ grade: text.trim() ? text : null })}
        />
      </ListSection>
      {scales.map((scale) => (
        <ListSection
          key={scale.grades.join()}
          title={t('tours.form.gradeScale', { activity: typeLabel(t, scale.type) })}
        >
          {scale.grades.map((chip) => (
            <ListRow
              key={chip}
              title={chip}
              checked={chosen.has(chip)}
              chevron={false}
              onPress={() => {
                const next = toggleGrade(grade, chip);
                update({ grade: next || null });
                void Haptics.selectionAsync();
              }}
            />
          ))}
        </ListSection>
      ))}
    </Page>
  );
}

function ChecklistPage({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [values, setValues] = useState(selected);
  return (
    <Page title={title}>
      <ListSection>
        {options.map((option) => (
          <ListRow
            key={option.value}
            title={option.label}
            checked={values.includes(option.value)}
            chevron={false}
            onPress={() => {
              const next = options
                .map((o) => o.value)
                .filter((v) => (v === option.value ? !values.includes(v) : values.includes(v)));
              setValues(next);
              onChange(next);
              void Haptics.selectionAsync();
            }}
          />
        ))}
      </ListSection>
    </Page>
  );
}

/** Partners from the user's contacts, searchable. */
function PartnersPage() {
  const { t } = useTranslation();
  const contacts = useContactsStore((s) => s.contacts);
  const partnerIds = useTourDraftStore((s) => s.draft.partnerIds);
  const [query, setQuery] = useState('');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .map((c) => ({ id: c.id, name: resolveContactName(c) }))
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, query]);
  return (
    <Page
      title={t('tours.form.partnersLabel')}
      search={{ value: query, onChange: setQuery, prompt: t('contacts.list.searchPlaceholder') }}
    >
      <ListSection>
        {shown.map((contact) => (
          <ListRow
            key={contact.id}
            title={contact.name}
            icon="person"
            checked={partnerIds.includes(contact.id)}
            chevron={false}
            onPress={() => {
              useTourDraftStore.getState().update({
                partnerIds: partnerIds.includes(contact.id)
                  ? partnerIds.filter((id) => id !== contact.id)
                  : [...partnerIds, contact.id],
              });
              void Haptics.selectionAsync();
            }}
          />
        ))}
      </ListSection>
    </Page>
  );
}

/** A picked day as the day-precision UTC date the tours store keeps. */
function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function timeOf(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d;
}

/** How many contacts the form offers inline before "All contacts". */
const SUGGESTED_PARTNERS = 5;

/**
 * The contacts the form offers as partners, a tap each: the ones already chosen, then those most
 * often along on the user's tours, then by name.
 */
function useSuggestedPartners(chosen: string[]): Contact[] {
  const contacts = useContactsStore((s) => s.contacts);
  const tours = useToursStore((s) => s.tours);
  // Ordered once per form: rows that jump as they are ticked would be tapped wrong.
  const [order] = useState(() => {
    const along = new Map<string, number>();
    for (const tour of tours) {
      for (const id of tour.partnerIds) along.set(id, (along.get(id) ?? 0) + 1);
    }
    const score = (c: Contact) => (chosen.includes(c.id) ? 1e6 : 0) + (along.get(c.id) ?? 0);
    return [...contacts]
      .sort(
        (a, b) => score(b) - score(a) || resolveContactName(a).localeCompare(resolveContactName(b)),
      )
      .map((c) => c.id);
  });
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const ranked = [
    ...order.map((id) => byId.get(id)).filter((c): c is Contact => !!c),
    // Contacts that arrive after the form opened (the list was still loading) go last.
    ...contacts.filter((c) => !order.includes(c.id)),
  ];
  return ranked.slice(0, Math.max(SUGGESTED_PARTNERS, chosen.length));
}

/** Opens a tour's sheet over the map, the map on it. */
function openTourSheet(id: string) {
  useMapStore.getState().selectTour(id);
  router.push({ pathname: '/tour/[id]', params: { id } });
}
