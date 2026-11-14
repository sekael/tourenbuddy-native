import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { router, useNavigation } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import type { IconName } from '@/core/adaptive/icons';
import {
  ContentRow,
  DateRow,
  ListRow,
  ListSection,
  PickerRow,
  TextRow,
  ToggleRow,
} from '@/core/adaptive/list';
import { Pills } from '@/core/adaptive/pills';
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
import { SEASON_VALUES } from '@/features/tours/data/models/season';
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
import { openTour } from '@/features/map/presentation/open-tour';
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
  const unsaved = dirty || !!(preUploaded?.length || staged?.length);
  // Unsaved, the form can't be swiped away: Cancel asks first.
  const navigation = useNavigation();
  useEffect(() => navigation.setOptions({ gestureEnabled: !unsaved }), [navigation, unsaved]);
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

  /**
   * To the map for the route or the track. A new tour's form sits right on the map; an edited
   * tour's sits on its sheet, perhaps on another tab: those close first, so the map is free, and
   * the tour's sheet comes back when the form is done.
   */
  function editOnMap(pathname: '/plan' | '/draw') {
    const params = { back: '1' };
    if (mode === 'create') {
      router.replace({ pathname, params });
      return;
    }
    useTourDraftStore.setState({ returnTo: tourId });
    router.dismissAll();
    router.navigate('/');
    router.push({ pathname, params });
  }

  /** Closes the form; `open` (a new tour), or the tour edited on the map, opens on the map. */
  function leaveForm(open?: string | null) {
    const reopen = open ?? useTourDraftStore.getState().returnTo;
    useTourDraftStore.getState().reset();
    // Opening the tour closes the form with the other sheets.
    if (reopen) openTour(reopen);
    else router.back();
  }

  function close() {
    const finish = () => {
      void useTourAttachmentsStore
        .getState()
        .discardDraft(draftId, mode === 'create' ? tourId : null);
      leaveForm();
    };
    if (!unsaved) {
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
      // A new tour opens on the map, as in the PWA: it is there, and what to do next is at hand.
      leaveForm(created);
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
      // Its ends are the route's start and end: one each, where the track begins and ends.
      store.setEnds(line[0]!, line.at(-1)!);
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

  /** An activity on or off; the ways up and down go back to their defaults. */
  function toggleType(type: TourType) {
    const next = TOUR_TYPE_VALUES.filter((v) =>
      v === type ? !types.includes(v) : types.includes(v),
    );
    update({ tourTypes: next, legs: legsFrom(next, (x) => defaultDirection(x, next)) });
  }
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
      </ListSection>

      {/* Activities and grade as the PWA's chips: a tap each, several activities at once. */}
      <ListSection title={t('tours.form.activityLabel')}>
        <ContentRow>
          <Pills
            accessibilityLabel={t('tours.form.activityLabel')}
            options={TOUR_TYPE_VALUES.map((type) => ({
              value: type,
              label: typeLabel(t, type),
              icon: TOUR_TYPE_ICONS[type] as IconName,
              iconColor: TOUR_TYPE_COLORS[type],
            }))}
            selected={types}
            onToggle={toggleType}
          />
        </ContentRow>
      </ListSection>

      <ListSection
        title={t('tours.form.gradeLabel')}
        footer={
          draft.grade &&
          !gradeLeads(draft.grade).every((g) => scales.some((sc) => sc.grades.includes(g)))
            ? draft.grade
            : undefined
        }
      >
        {scales.map((scale) => (
          <ContentRow key={scale.grades.join()}>
            <Pills
              single
              accessibilityLabel={t('tours.form.gradeScale', {
                activity: typeLabel(t, scale.type),
              })}
              options={scale.grades.map((g) => ({
                value: g,
                label: g,
                ...(scales.length > 1 && g === scale.grades[0]
                  ? {
                      icon: TOUR_TYPE_ICONS[scale.type] as IconName,
                      iconColor: TOUR_TYPE_COLORS[scale.type],
                    }
                  : {}),
              }))}
              selected={gradeLeads(draft.grade ?? '')}
              onToggle={(chip) => update({ grade: toggleGrade(draft.grade ?? '', chip) || null })}
            />
          </ContentRow>
        ))}
        <ListRow
          title={scales.length ? t('tours.form.gradeMore') : t('tours.filters.gradeLabel')}
          value={scales.length ? undefined : (draft.grade ?? undefined)}
          icon="edit"
          onPress={() => onPush('grade')}
        />
      </ListSection>

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
        {/* Below the activities, so a second one never pushes the grade under the thumb. */}
        {types.length > 1 ? (
          <ListRow
            title={t('tours.form.legs.label')}
            icon="swap_vert"
            onPress={() => onPush('activities')}
          />
        ) : null}
        <ListRow
          title={t('tours.form.changeRouteBtn')}
          icon="edit"
          onPress={() => editOnMap('/plan')}
        />
        <ListRow
          title={trackLabel}
          subtitle={track?.line ? formatDistance(lineLength(track.line)) : t('tours.form.gpxLabel')}
          icon="route"
          menu={[
            {
              label: hasTrack ? t('tours.form.gpxEditBtn') : t('tours.form.gpxDrawBtn'),
              icon: 'draw',
              onPress: () => editOnMap('/draw'),
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
        {mode !== 'suggest' && suggested.length === 0 ? (
          <ListRow
            title={t('tours.form.partnersLabel')}
            value={partners.length ? partners.join(', ') : undefined}
            icon="group"
            onPress={() => onPush('partners')}
          />
        ) : null}
      </ListSection>

      <ListSection title={t('tours.form.seasonLabel')}>
        <ContentRow>
          <Pills
            accessibilityLabel={t('tours.form.seasonLabel')}
            options={SEASON_VALUES.map((season) => ({
              value: season,
              label: t(`tours.season.${season}`),
            }))}
            selected={draft.seasons ?? []}
            onToggle={(season) => {
              const seasons = draft.seasons ?? [];
              update({
                seasons: SEASON_VALUES.filter((v) =>
                  v === season ? !seasons.includes(v) : seasons.includes(v),
                ),
              });
            }}
          />
        </ContentRow>
      </ListSection>

      {mode !== 'suggest' && suggested.length ? (
        // Who comes along is a tap per person, as the PWA's chips: the people most often along
        // first, the rest of the contacts one row further.
        <ListSection title={t('tours.form.partnersLabel')}>
          <ContentRow>
            <Pills
              accessibilityLabel={t('tours.form.partnersLabel')}
              options={suggested.map((contact) => ({
                value: contact.id,
                label: resolveContactName(contact),
              }))}
              selected={draft.partnerIds}
              onToggle={(id) =>
                update({
                  partnerIds: draft.partnerIds.includes(id)
                    ? draft.partnerIds.filter((x) => x !== id)
                    : [...draft.partnerIds, id],
                })
              }
            />
          </ContentRow>
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
          {/* The same switch as on the tour's sheet (the PWA's "Privat"): on hides the tour. */}
          <ToggleRow
            title={t('tours.form.visibilityPrivate')}
            icon="lock"
            value={draft.visibility === 'private'}
            onValueChange={(hidden) => update({ visibility: hidden ? 'private' : 'friends' })}
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

/** With several activities, which way each goes (activity-legs). */
function ActivitiesPage() {
  const { t } = useTranslation();
  const draft = useTourDraftStore((s) => s.draft);
  const update = useTourDraftStore.getState().update;
  const types = draft.tourTypes;
  const direction = (type: TourType): LegDirection =>
    draft.legs ? directionOf(draft.legs, type) : defaultDirection(type, types);

  function setDirection(type: TourType, way: LegDirection) {
    const pick = (x: TourType) => (x === type ? way : direction(x));
    if (!waysCovered(types, pick)) return;
    update({ legs: legsFrom(types, pick) });
  }

  return (
    <Page title={t('tours.form.legs.label')}>
      <ListSection footer={t('tours.form.legs.hint')}>
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
