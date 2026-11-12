import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import type { TFunction } from 'i18next';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';

import { ListRow, ListSection, type RowAction } from '@/core/adaptive/list';
import { newId, type LocalFile } from '@/core/files';
import { createLogger } from '@/core/logging/logger';
import { cachedUri } from '@/core/offline/file-cache';
import { formatBytes } from '@/core/utils/format-bytes';
import { MAX_ATTACHMENTS_PER_TOUR } from '@/features/tours/data/models/tour-attachment';
import type { TourAttachment } from '@/features/tours/domain/entities/tour-attachment';

import { useTourAttachmentsStore } from './stores/tour-attachments-store';

const log = createLogger('Attachments');

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  pdf: 'application/pdf',
  heic: 'image/heic',
  heif: 'image/heif',
};

function typeOf(name: string, given?: string | null): string {
  if (given) return given;
  return MIME_BY_EXT[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
}

/** Photos from the library or the camera: HEIC arrives as JPEG ('compatible'), EXIF kept (D7). */
async function pickImages(source: 'library' | 'camera', limit: number): Promise<LocalFile[]> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    exif: true,
    quality: 1,
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    allowsMultipleSelection: source === 'library',
    selectionLimit: Math.max(1, limit),
  };
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new PermissionError();
  }
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  return result.assets.map((asset) => {
    const ext = asset.mimeType === 'image/png' ? 'png' : 'jpg';
    const name = asset.fileName ?? `photo-${newId().slice(0, 8)}.${ext}`;
    return {
      uri: asset.uri,
      name,
      type: typeOf(name, asset.mimeType),
      size: asset.fileSize ?? new File(asset.uri).size ?? 0,
    };
  });
}

async function pickDocuments(): Promise<LocalFile[]> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/png', 'image/jpeg'],
    multiple: true,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    name: asset.name,
    type: typeOf(asset.name, asset.mimeType),
    size: asset.size ?? 0,
  }));
}

class PermissionError extends Error {}

/** The three ways in (tour-attachments): photo library, camera, Files. */
export function usePickActions(onFiles: (files: LocalFile[]) => void, limit: number): RowAction[] {
  const { t } = useTranslation();
  const run = (pick: () => Promise<LocalFile[]>) => async () => {
    try {
      const files = await pick();
      if (files.length) onFiles(files);
    } catch (error) {
      if (error instanceof PermissionError) {
        Alert.alert(t('tours.attachments.cameraDenied'), undefined, [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.openSettings'), onPress: () => void Linking.openSettings() },
        ]);
        return;
      }
      log.error('Pick failed', error);
    }
  };
  return [
    {
      label: t('tours.attachments.fromPhotos'),
      icon: 'image',
      onPress: run(() => pickImages('library', limit)),
    },
    ...(Platform.OS === 'web'
      ? []
      : [
          {
            label: t('tours.attachments.fromCamera'),
            icon: 'photo_camera' as const,
            onPress: run(() => pickImages('camera', 1)),
          },
        ]),
    { label: t('tours.attachments.fromFiles'), icon: 'upload_file', onPress: run(pickDocuments) },
  ];
}

/**
 * Opens a tour's attachments in the system viewer (D7): Quick Look on iOS, swiping between all of
 * the ones on the device from the one tapped, zoom, PDF pages, share and markup in its toolbar.
 * Bytes come from the cache first; a file not cached needs the network once.
 */
export async function previewAttachments(
  attachments: TourAttachment[],
  index: number,
  t: TFunction,
) {
  const store = useTourAttachmentsStore.getState();
  try {
    if (Platform.OS === 'web') {
      await Linking.openURL(await store.localUri(attachments[index]!));
      return;
    }
    if (Platform.OS === 'android') {
      // Android previews one file at a time, in the app that handles its type.
      await File.preview(new File(await store.localUri(attachments[index]!)), {
        mimeType: attachments[index]!.mimeType,
      });
      return;
    }
    // Only the tapped file waits for the network; the viewer swipes through the ones already on the
    // device, so one missing file never blocks the rest.
    // ponytail: no prefetch of the others; add one if swiping a fresh tour feels thin.
    const tapped = await store.localUri(attachments[index]!);
    const uris = attachments.map((a, i) => (i === index ? tapped : cachedUri(a.storagePath)));
    const files = uris.filter((uri) => uri !== undefined).map((uri) => new File(uri));
    await File.preview(files, { initialIndex: uris.slice(0, index).filter(Boolean).length });
  } catch (error) {
    log.warn('Preview failed', error);
    Alert.alert(t('tours.attachments.unavailableOffline'));
  }
}

async function shareAttachment(attachment: TourAttachment, t: TFunction) {
  try {
    const uri = await useTourAttachmentsStore.getState().localUri(attachment);
    await Sharing.shareAsync(uri, {
      mimeType: attachment.mimeType,
      dialogTitle: attachment.originalFilename,
    });
  } catch (error) {
    log.warn('Share failed', error);
    Alert.alert(t('tours.attachments.unavailableOffline'));
  }
}

/**
 * A tour's attachments on its detail (tour-attachments): one row per file (tap: Quick Look; long
 * press: share, delete), uploads in progress with their share and Cancel / Retry, and, for the
 * owner, "Add file" with the three sources while there is room.
 */
export function AttachmentsSection({ tourId, editable }: { tourId: string; editable: boolean }) {
  const { t } = useTranslation();
  const attachments = useTourAttachmentsStore((s) => s.attachmentsByTour[tourId]);
  const pending = useTourAttachmentsStore((s) => s.pendingByTour[tourId]);
  const error = useTourAttachmentsStore((s) => s.error);
  const list = attachments ?? [];
  const uploads = (pending ?? []).filter((p) => !p.draftId);
  const room = MAX_ATTACHMENTS_PER_TOUR - list.length - uploads.length;
  const pick = usePickActions(
    (files) => void useTourAttachmentsStore.getState().add(tourId, files),
    room,
  );

  useEffect(() => {
    void useTourAttachmentsStore.getState().load(tourId);
  }, [tourId]);

  if (list.length === 0 && uploads.length === 0 && !editable) return null;

  const confirmRemove = (attachment: TourAttachment) =>
    Alert.alert(
      t('tours.attachments.deleteConfirm.title'),
      t('tours.attachments.deleteConfirm.body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('tours.attachments.delete'),
          style: 'destructive',
          onPress: () => void useTourAttachmentsStore.getState().remove(attachment),
        },
      ],
    );

  return (
    <ListSection title={t('tours.form.attachmentsSectionLabel')} footer={error ?? undefined}>
      {list.map((attachment, index) => {
        const share: RowAction = {
          label: t('tours.attachments.share'),
          icon: 'share',
          onPress: () => void shareAttachment(attachment, t),
        };
        const remove: RowAction = {
          label: t('tours.attachments.delete'),
          icon: 'delete',
          destructive: true,
          onPress: () => confirmRemove(attachment),
        };
        return (
          <ListRow
            key={attachment.id}
            title={attachment.originalFilename}
            subtitle={formatBytes(attachment.sizeBytes)}
            icon={attachment.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'image'}
            onPress={() => void previewAttachments(list, index, t)}
            chevron={false}
            swipeActions={editable ? [remove] : undefined}
            contextActions={editable ? [share, remove] : [share]}
          />
        );
      })}
      {uploads.map((upload) => (
        <ListRow
          key={upload.id}
          title={upload.filename}
          subtitle={
            upload.status === 'failed'
              ? t('tours.attachments.uploadFailed')
              : `${t('tours.attachments.uploading')} ${Math.round(upload.progress * 100)} %`
          }
          icon={upload.status === 'failed' ? 'warning' : 'upload_file'}
          iconColor={upload.status === 'failed' ? undefined : undefined}
          menu={
            upload.status === 'failed'
              ? [
                  {
                    label: t('tours.attachments.retryUpload'),
                    icon: 'replay',
                    onPress: () => void useTourAttachmentsStore.getState().retryUpload(upload.id),
                  },
                  {
                    label: t('tours.attachments.dismissUpload'),
                    icon: 'delete',
                    destructive: true,
                    onPress: () => useTourAttachmentsStore.getState().dismissUpload(upload.id),
                  },
                ]
              : [
                  {
                    label: t('tours.attachments.cancelUpload'),
                    icon: 'close',
                    destructive: true,
                    onPress: () => useTourAttachmentsStore.getState().cancelUpload(upload.id),
                  },
                ]
          }
        />
      ))}
      {editable && room > 0 ? (
        <ListRow title={t('tours.attachments.add')} icon="attach_file" menu={pick} />
      ) : null}
    </ListSection>
  );
}
