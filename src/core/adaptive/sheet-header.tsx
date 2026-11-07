import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { space } from '@/core/theme/tokens';

import { CloseButton } from './close-button';
import { Text } from './text';

type SheetHeaderProps = { title: string; titleId?: string; onClose: () => void };

export function SheetHeader({ title, titleId, onClose }: SheetHeaderProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.header}>
      <Text variant="title" role="heading" id={titleId} style={styles.title}>
        {title}
      </Text>
      <CloseButton label={t('common.close')} onPress={onClose} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  title: { flex: 1 },
});
