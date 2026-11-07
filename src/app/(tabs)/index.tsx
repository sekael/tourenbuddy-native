import { useTranslation } from 'react-i18next';

import { color } from '@/core/theme/tokens';
import { MapMenu } from '@/features/shell/presentation/map-menu';
import { PlaceholderScreen } from '@/features/shell/presentation/placeholder-screen';

export default function MapTab() {
  const { t } = useTranslation();
  return (
    <PlaceholderScreen
      title="TourenBuddy"
      subtitle={t('shell.tagline')}
      tint={color.surfaceVariant}
    >
      <MapMenu />
    </PlaceholderScreen>
  );
}
