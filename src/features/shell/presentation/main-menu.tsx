import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { FloatingMenu } from '@/core/adaptive/floating-menu';

/**
 * The app menu in the thumb zone of both tabs. Map layers and offline maps join it with the map
 * port; each entry opens its feature as a sheet.
 */
export function MainMenu() {
  const { t } = useTranslation();

  return (
    <FloatingMenu
      label={t('map.overlay.menuOpen')}
      closeLabel={t('map.overlay.menuClose')}
      items={[
        {
          id: 'inbox',
          label: t('map.overlay.inbox'),
          icon: 'inbox',
          onPress: () => router.push('/inbox'),
        },
        {
          id: 'contacts',
          label: t('map.overlay.contacts'),
          icon: 'contacts',
          onPress: () => router.push('/contacts'),
        },
        {
          id: 'profile',
          label: t('map.overlay.profile'),
          icon: 'profile',
          onPress: () => router.push('/profile'),
        },
        {
          id: 'feedback',
          label: t('map.overlay.feedback'),
          icon: 'feedback',
          onPress: () => router.push('/feedback'),
        },
      ]}
    />
  );
}
