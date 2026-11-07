import { useTranslation } from 'react-i18next';

import { PlaceholderScreen } from '@/features/shell/presentation/placeholder-screen';

export default function CalendarTab() {
  const { t } = useTranslation();
  return <PlaceholderScreen title={t('shell.tabs.calendar')} subtitle={t('shell.comingSoon')} />;
}
