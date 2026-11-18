import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { Page } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { color, radius, space } from '@/core/theme/tokens';

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
 *
 * A document of the app's own, not a system list: in a SwiftUI list a long paragraph got a row a
 * line too short and was cut, both as hosted text and as system text (German hyphenation).
 */
export function AboutPage({ name }: { name: AboutPageName }) {
  const { t } = useTranslation();
  const doc = t(`about.${name}`, { returnObjects: true }) as unknown as AboutDoc;
  const mail = (address: string) =>
    void Linking.openURL(`mailto:${address}`).catch(() =>
      Alert.alert(t('core.feedback.sheet.errorMail', { email: address })),
    );

  return (
    <Page
      title={doc.title}
      body={
        <ScrollView
          style={styles.page}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
        >
          {doc.sections.map((section, i) => (
            <View key={section.title ?? i} style={styles.section}>
              {section.title ? (
                <Text variant="label" role="heading" style={styles.sectionTitle}>
                  {section.title}
                </Text>
              ) : null}
              <View style={styles.card}>
                {section.rows
                  .filter((row) => !row.country || OPERATOR.length > 0)
                  .map((row, j) => (
                    <View key={row.label ?? row.text} style={[styles.row, j > 0 && styles.divided]}>
                      {row.label ? <Text variant="label">{row.label}</Text> : null}
                      <Text>
                        {(row.country ? [row.text, ...OPERATOR, row.country].join('\n') : row.text)
                          .split(EMAIL)
                          .map((part, k) =>
                            k % 2 ? (
                              <Text
                                key={k}
                                role="link"
                                style={styles.link}
                                onPress={() => mail(part)}
                              >
                                {part}
                              </Text>
                            ) : (
                              part
                            ),
                          )}
                      </Text>
                    </View>
                  ))}
              </View>
            </View>
          ))}
          <Text variant="caption" style={styles.updated}>
            {doc.updated}
          </Text>
        </ScrollView>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.groupedBackground },
  content: { padding: space.md, gap: space.lg, paddingBottom: space.xxxl },
  section: { gap: space.xs },
  sectionTitle: { color: color.onSurfaceVariant, paddingHorizontal: space.md },
  card: { backgroundColor: color.background, borderRadius: radius.lg, paddingHorizontal: space.md },
  row: { paddingVertical: space.sm, gap: space.xxs },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.divider },
  link: { color: color.primary },
  updated: { color: color.onSurfaceVariant, paddingHorizontal: space.md },
});
