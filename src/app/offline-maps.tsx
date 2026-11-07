import { useTranslation } from 'react-i18next';

import { PlaceholderSheet } from '@/features/shell/presentation/placeholder-sheet';

export default function OfflineMapsSheet() {
  const { t } = useTranslation();
  return <PlaceholderSheet title={t('map.overlay.offlineMap')} />;
}
