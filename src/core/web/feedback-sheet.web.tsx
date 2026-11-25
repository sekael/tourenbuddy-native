import { useTranslation } from 'react-i18next';

import {
  BUG_REPORT_GITHUB_ISSUE_URL,
  FEEDBACK_EMAIL,
  FEEDBACK_GITHUB_ISSUE_URL,
} from '@/core/feedback';
import { createLogger } from '@/core/logging/logger';

import { AdaptiveOverlay } from './adaptive-overlay.web';
import { BaseButton } from './base-button.web';
import { classes } from './classes';
import { ErrorSnackbar } from './error-snackbar.web';
import styles from './feedback-sheet.module.css';
import { useSnackbar } from './use-snackbar.web';

const c = classes(styles);
const log = createLogger('feedback-sheet');

/** Feedback and bug reports: GitHub issue templates in a new tab, or email. */
export function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('web');
  const { snackbar, show, dismiss } = useSnackbar();

  /** Opens an issue template in a new tab; a blocked pop-up says where to write instead. */
  function openIssue(url: string) {
    log.info('Opening GitHub issue URL', url);
    if (window.open(url, '_blank') === null)
      show(t('core.feedback.sheet.errorOpening', { email: FEEDBACK_EMAIL }));
    else onClose();
  }

  return (
    <>
      <AdaptiveOverlay title={t('core.feedback.sheet.title')} onClose={onClose}>
        <div className={c('feedback-content')}>
          <BaseButton variant="primary" onClick={() => openIssue(BUG_REPORT_GITHUB_ISSUE_URL)}>
            {t('core.feedback.sheet.openBugReport')}
          </BaseButton>
          <BaseButton variant="text" onClick={() => openIssue(FEEDBACK_GITHUB_ISSUE_URL)}>
            {t('core.feedback.sheet.openIssue')}
          </BaseButton>
          <p className={c('hint')}>
            {t('core.feedback.sheet.noGitHub')}{' '}
            <a href={`mailto:${FEEDBACK_EMAIL}`} className={c('email-link')}>
              {FEEDBACK_EMAIL}
            </a>
          </p>
        </div>
      </AdaptiveOverlay>
      <ErrorSnackbar message={snackbar.message} visible={snackbar.visible} onDismiss={dismiss} />
    </>
  );
}
