import { useTranslation } from 'react-i18next';

import { PlaceholderSheet } from '@/features/shell/presentation/placeholder-sheet';

export default function ContactsSheet() {
  const { t } = useTranslation();
  return <PlaceholderSheet title={t('map.overlay.contacts')} />;
}
