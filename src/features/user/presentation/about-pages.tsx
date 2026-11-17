import { useTranslation } from 'react-i18next';
import { Alert, Linking, StyleSheet } from 'react-native';

import { ContentRow, ListSection } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { color, space } from '@/core/theme/tokens';

export type AboutPageName = 'privacy' | 'terms' | 'imprint';

/** `country` marks the imprint's "operated by" row: the operator's address goes under it. */
type AboutRow = { label?: string; text: string; country?: string };
type AboutDoc = {
  title: string;
  updated: string;
  sections: { title?: string; rows: AboutRow[] }[];
};

/**
 * The operator's name, street and postcode with place, as the imprint names them. Empty until the
 * owner fills them in (here and in `public/imprint`, `public/de/imprint`); until then the imprint
 * leaves out its "operated by" lines rather than show placeholders.
 */
export const OPERATOR: readonly string[] = [];

const EMAIL = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/;

/**
 * The «Über» pages inside the app: privacy policy, terms of use, imprint. Their text is the
 * website's (`public/`), kept word for word in the locales, so nothing needs a browser or a
 * connection; an email address opens a new mail.
 */
export function AboutPage({ name }: { name: AboutPageName }) {
  const { t } = useTranslation();
  const doc = t(`about.${name}`, { returnObjects: true }) as unknown as AboutDoc;
  const mail = (address: string) =>
    void Linking.openURL(`mailto:${address}`).catch(() =>
      Alert.alert(t('core.feedback.sheet.errorMail', { email: address })),
    );

  return (
    <Page title={doc.title}>
      {doc.sections.map((section, i) => (
        <ListSection
          key={section.title ?? i}
          title={section.title}
          footer={i === doc.sections.length - 1 ? doc.updated : undefined}
        >
          {section.rows
            .filter((row) => !row.country || OPERATOR.length > 0)
            .map((row) => (
              <ContentRow key={row.label ?? row.text}>
                {row.label ? (
                  <Text variant="label" style={styles.label}>
                    {row.label}
                  </Text>
                ) : null}
                <Text>
                  {(row.country ? [row.text, ...OPERATOR, row.country].join('\n') : row.text)
                    .split(EMAIL)
                    .map((part, j) =>
                      j % 2 ? (
                        <Text key={j} role="link" style={styles.link} onPress={() => mail(part)}>
                          {part}
                        </Text>
                      ) : (
                        part
                      ),
                    )}
                </Text>
              </ContentRow>
            ))}
        </ListSection>
      ))}
    </Page>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: space.xxs },
  link: { color: color.primary },
});
