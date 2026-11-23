import { useTranslation } from 'react-i18next';

import { appVersionLabel } from '@/core/web/app-version.web';
import { classes } from '@/core/web/classes';

import styles from './app-version-line.module.css';

const c = classes(styles);

export function AppVersionLine() {
  const { t } = useTranslation('web');
  return (
    <p className={c('version')} data-testid="app-version">
      {t('user.profile.version', { version: appVersionLabel() })}
    </p>
  );
}
