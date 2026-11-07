import { useTranslation } from 'react-i18next';

import { FloatingMenu } from '@/core/adaptive/floating-menu';

import { type ShellTab, useMainMenuItems } from './use-main-menu-items';

/** The app menu as a FAB above the navigation bar (Android, web). iOS has it in the glass dock. */
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
