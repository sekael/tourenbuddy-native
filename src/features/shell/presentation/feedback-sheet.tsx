import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, Linking } from 'react-native';

import { ListRow, ListSection } from '@/core/adaptive/list';
import { Page, Screen } from '@/core/adaptive/screen';
import {
  BUG_REPORT_GITHUB_ISSUE_URL,
  FEEDBACK_EMAIL,
  FEEDBACK_GITHUB_ISSUE_URL,
} from '@/core/feedback';

/** Feedback (feedback): an idea or a bug on GitHub, or an email for those without an account. */
export function FeedbackSheet() {
  const { t } = useTranslation();
  const open = (url: string) => () =>
    void Linking.openURL(url).catch(() =>
      Alert.alert(t('core.feedback.sheet.errorOpening', { email: FEEDBACK_EMAIL })),
    );

  return (
    <Screen>
      <Page title={t('core.feedback.sheet.title')} onClose={() => router.back()}>
        <ListSection footer={`${t('core.feedback.sheet.noGitHub')} ${FEEDBACK_EMAIL}`}>
          <ListRow
            title={t('core.feedback.sheet.openIssue')}
            icon="feedback"
            onPress={open(FEEDBACK_GITHUB_ISSUE_URL)}
          />
          <ListRow
            title={t('core.feedback.sheet.openBugReport')}
            icon="flag"
            onPress={open(BUG_REPORT_GITHUB_ISSUE_URL)}
          />
          <ListRow title={FEEDBACK_EMAIL} icon="mail" onPress={open(`mailto:${FEEDBACK_EMAIL}`)} />
        </ListSection>
      </Page>
    </Screen>
  );
}
