import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shell/presentation/placeholder-screen';

export default function ProfileTab() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('shell.tabs.profile')} subtitle={t('shell.comingSoon')} />;
}
