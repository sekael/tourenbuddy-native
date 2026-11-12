import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

import { safeFileName } from '@/core/files';
import i18n from '@/core/i18n';
import { createLogger } from '@/core/logging/logger';
import { cachedUri } from '@/core/offline/file-cache';
import { isOnline } from '@/core/offline/online';
import { shareOriginal } from '@/features/tours/data/services/gpx-storage-service';
import type { Tour } from '@/features/tours/domain/entities/tour';

const log = createLogger('ShareGpx');

/**
 * The tour's GPX to the share sheet (gpx-tracks "Download GPX"): the original from storage, or,
 * offline, the copy the map cached when it drew the track.
 */
export async function shareTourGpx(tour: Pick<Tour, 'gpxFilepath' | 'name'>): Promise<void> {
  if (!tour.gpxFilepath) return;
  const name = safeFileName(tour.name ?? 'tour');
  const cached = cachedUri(tour.gpxFilepath);
  try {
    if (!isOnline() && cached && Platform.OS !== 'web') {
      await Sharing.shareAsync(cached, {
        mimeType: 'application/gpx+xml',
        UTI: 'com.topografix.gpx',
      });
      return;
    }
    await shareOriginal(tour.gpxFilepath, name);
  } catch (error) {
    log.warn('GPX share failed', error);
    Alert.alert(i18n.t('tours.infoSheet.downloadGpxFailed'));
  }
}
