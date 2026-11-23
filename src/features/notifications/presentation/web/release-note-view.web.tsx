import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import type { ReleaseNote } from '@/features/notifications/data/release-notes';

import styles from './release-note-view.module.css';

const c = classes(styles);

/** One release note, read in the inbox in place of the list. */
export function ReleaseNoteView({
  note,
  onOpenSettings,
}: {
  note: ReleaseNote;
  onOpenSettings: () => void;
}) {
  const { t, i18n } = useTranslation('web');
  const copy = (path: string) =>
    (t as unknown as (key: string) => string)(`releaseNotes.${note.id}.${path}`);
  // `since` is a calendar date, not an instant: local parts, never the day before west of UTC.
  const [y, m, d] = note.since.split('-').map(Number);
  const date = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(y!, m! - 1, d!));

  return (
    <article className={c('note')} data-testid="release-note">
      <header className={c('head')}>
        <span className={c('badge')} aria-hidden="true">
          <BaseIcon name="auto_awesome" className={c('badge-icon')} />
        </span>
        <p className={c('eyebrow')}>
          {t('inbox.releaseNote.eyebrow')} · <time dateTime={note.since}>{date}</time>
        </p>
        <h3 className={c('title')}>{copy('title')}</h3>
        <p className={c('intro')} data-testid="release-note-body">
          {copy('intro')}
        </p>
      </header>
      <ul className={c('features')}>
        {note.features.map((feature) => (
          <li key={feature.key} className={c('feature')}>
            <span className={c('feature-icon')} aria-hidden="true">
              <BaseIcon name={feature.icon} />
            </span>
            <span className={c('feature-text')}>
              <span className={c('feature-title')}>{copy(`features.${feature.key}.title`)}</span>
              <span className={c('feature-body')}>{copy(`features.${feature.key}.body`)}</span>
            </span>
          </li>
        ))}
      </ul>
      {note.action === 'notification-settings' && (
        <footer className={c('foot')}>
          <p className={c('hint')}>{t('inbox.releaseNote.settingsHint')}</p>
          <BaseButton
            variant="secondary"
            className={c('action')}
            data-testid="release-note-settings"
            onClick={onOpenSettings}
          >
            <BaseIcon name="notifications" />
            {t('inbox.releaseNote.settingsAction')}
          </BaseButton>
        </footer>
      )}
    </article>
  );
}
