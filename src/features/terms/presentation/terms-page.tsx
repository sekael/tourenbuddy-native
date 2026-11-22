import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useStore } from 'zustand';

import { Button } from '@/core/adaptive/button';
import { Icon } from '@/core/adaptive/icon';
import type { IconName } from '@/core/adaptive/icons';
import { linkMark, LinkedText } from '@/core/adaptive/linked-text';
import { Page } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { connectivity } from '@/core/offline/online';
import { color, radius, size, space } from '@/core/theme/tokens';
import { storeSearchUrl } from '@/core/update/gate';

import { TERMS_VERSION } from '../domain/terms';
import { useTermsStore } from './stores/terms-store';

type Props = {
  /** Opens the full terms or privacy policy over this page. */
  onOpen: (page: 'terms' | 'privacy') => void;
  onSignOut: () => void;
  onDelete: () => void;
  deleting: boolean;
};

/** What the terms mean for the user, one line each, in this order. */
const POINTS: { key: 'plans' | 'risk' | 'liability' | 'indemnity'; icon: IconName }[] = [
  { key: 'plans', icon: 'share' },
  { key: 'risk', icon: 'hiking' },
  { key: 'liability', icon: 'warning' },
  { key: 'indemnity', icon: 'group' },
];

/**
 * The acceptance page (terms-acceptance): the summary of what the terms mean for the user, links to
 * the full texts, and the way on: accept, or sign out, or delete the account. The app behind it is
 * unreachable until the version in force is accepted.
 */
export function TermsPage({ onOpen, onSignOut, onDelete, deleting }: Props) {
  const { t } = useTranslation();
  const { gate, offline, accepting, failed, accept, check } = useTermsStore();
  const online = useStore(connectivity, (s) => s.online);

  // Back online: an earlier failure is stale, and with nothing confirmed, ask the server again.
  useEffect(() => {
    if (!online) return;
    useTermsStore.setState({ failed: false });
    if (useTermsStore.getState().offline) void check();
  }, [online, check]);

  const links = {
    terms: { label: t('terms.termsLink'), onPress: () => onOpen('terms') },
    privacy: { label: t('terms.privacyLink'), onPress: () => onOpen('privacy') },
  };
  const whatChanged = t('terms.whatChanged', { returnObjects: true }) as Record<string, string>;
  const canAccept = gate === 'accept' || gate === 'changed';
  const noConnection = !online || offline;
  const web = Platform.OS === 'web';

  return (
    <Page
      title={t('terms.title')}
      body={
        <ScrollView style={styles.page} contentContainerStyle={styles.content}>
          {gate === 'loading' ? (
            <ActivityIndicator color={color.primary} />
          ) : (
            <View style={styles.column}>
              {canAccept ? (
                <>
                  <Text>
                    {gate === 'changed'
                      ? t('terms.changedLead', { changes: whatChanged[TERMS_VERSION] ?? '' })
                      : t('terms.lead')}
                  </Text>
                  <View style={styles.points}>
                    {POINTS.map(({ key, icon }) => (
                      <View key={key} style={styles.point}>
                        <View style={styles.badge}>
                          <Icon name={icon} size={20} color={color.onSecondaryContainer} />
                        </View>
                        <Text style={styles.pointText}>{t(`terms.points.${key}`)}</Text>
                      </View>
                    ))}
                  </View>
                  <LinkedText
                    links={links}
                    text={t('terms.read', {
                      terms: linkMark('terms'),
                      privacy: linkMark('privacy'),
                    })}
                  />
                </>
              ) : (
                <Text>
                  {gate === 'unavailable'
                    ? t('terms.unavailable')
                    : web
                      ? t('terms.updateWeb')
                      : t('terms.update')}
                </Text>
              )}
              {canAccept && noConnection ? (
                <Text variant="caption" role="status" style={styles.muted}>
                  {t('terms.offline')}
                </Text>
              ) : null}
              {canAccept && failed && !noConnection ? (
                <Text variant="caption" role="alert" style={styles.error}>
                  {t('terms.failed')}
                </Text>
              ) : null}
              {canAccept ? (
                <Button
                  label={accepting ? t('terms.accepting') : t('terms.acceptBtn')}
                  onPress={() => void accept()}
                  disabled={accepting || noConnection || deleting}
                />
              ) : gate === 'update' ? (
                <Button
                  label={web ? t('terms.reloadBtn') : t('terms.updateBtn')}
                  onPress={() =>
                    web
                      ? window.location.reload()
                      : void Linking.openURL(storeSearchUrl(Platform.OS))
                  }
                />
              ) : (
                <Button label={t('terms.retryBtn')} onPress={() => void check()} />
              )}
              <Button
                variant="secondary"
                label={t('terms.signOutBtn')}
                onPress={onSignOut}
                disabled={accepting || deleting}
              />
              <Button
                variant="plain"
                label={deleting ? t('user.profile.deleteAccount.deleting') : t('terms.deleteBtn')}
                onPress={onDelete}
                disabled={accepting || deleting}
              />
            </View>
          )}
        </ScrollView>
      }
    />
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: color.background },
  // Short content sits in the middle of the screen, long content scrolls from the top.
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: space.lg,
    paddingBottom: space.xxxl,
    alignItems: 'center',
  },
  column: { gap: space.lg, width: '100%', maxWidth: size.form },
  points: { gap: space.md },
  // Each icon sits in the middle of its text, one line or several (as in the PWA).
  point: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  badge: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: color.secondaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: { flex: 1 },
  muted: { color: color.onSurfaceVariant },
  error: { color: color.error },
});
