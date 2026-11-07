import { useTranslation } from 'react-i18next';

import { FloatingMenu } from '@/core/adaptive/floating-menu';

import { type ShellTab, useMainMenuItems } from './use-main-menu-items';

/** The app menu in the bottom-trailing corner, above the tab bar: a glass circle with the system menu
 * on iOS, a FAB menu on Android and web. */
export function MainMenu({ tab }: { tab: ShellTab }) {
  const { t } = useTranslation();
  const items = useMainMenuItems(tab);

  return (
    <FloatingMenu
      label={t('map.overlay.menuOpen')}
      closeLabel={t('map.overlay.menuClose')}
      items={items}
    />
  );
}
