import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking, Modal, StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';

import { Button } from '@/core/adaptive/button';
import { Icon } from '@/core/adaptive/icon';
import { Text } from '@/core/adaptive/text';
import { connectivity } from '@/core/offline/online';
import { color, size, space } from '@/core/theme/tokens';

import { checkForUpdate, updateGate } from './gate';

/**
 * The update gate's screen (update gate, D2): full screen over everything, sheets included, with
 * no way past it but the store. Checks at start and on every return to the foreground. Offline it
 * steps aside (app-update: being offline never blocks the app) and returns with the connection.
 */
export function UpdateGate() {
  const { t } = useTranslation();
  const storeUrl = useStore(updateGate, (s) => s.storeUrl);
  const online = useStore(connectivity, (s) => s.online);

  useEffect(() => {
    void checkForUpdate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkForUpdate();
    });
    return () => subscription.remove();
  }, []);

  return (
    <Modal visible={!!storeUrl && online} animationType="fade" presentationStyle="fullScreen">
      <View style={styles.screen}>
        <Icon name="download" color={color.primary} size={size.fab} />
        <Text variant="title" role="heading" style={styles.center}>
          {t('core.update.title')}
        </Text>
        <Text style={[styles.center, styles.muted]}>{t('core.update.body')}</Text>
        <Button label={t('core.update.action')} onPress={() => void Linking.openURL(storeUrl!)} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.lg,
    padding: space.xl,
    backgroundColor: color.background,
  },
  center: { textAlign: 'center', maxWidth: size.form },
  muted: { color: color.onSurfaceVariant },
});
