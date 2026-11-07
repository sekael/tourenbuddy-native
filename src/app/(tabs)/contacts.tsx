import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shell/presentation/placeholder-screen';

export default function ContactsTab() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('shell.tabs.contacts')} subtitle={t('shell.comingSoon')} />;
}
