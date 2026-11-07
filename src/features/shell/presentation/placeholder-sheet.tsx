import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { Sheet } from '@/core/adaptive/sheet';
import { Text } from '@/core/adaptive/text';
import { color } from '@/core/theme/tokens';

/** Stands in for a menu destination until its feature is ported. */
export function PlaceholderSheet({ title }: { title: string }) {
  const { t } = useTranslation();

  return (
    <Sheet title={title}>
      <Text style={styles.body}>{t('shell.comingSoon')}</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { color: color.onSurfaceVariant },
});
