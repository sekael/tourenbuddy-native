import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/core/adaptive/icon';
import type { IconName } from '@/core/adaptive/icons';
import { EmptyState, ListRow, ListSection, type RowAction } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { Text } from '@/core/adaptive/text';
import { sessionUser } from '@/core/auth/session-user';
import { useFormatter } from '@/core/i18n/format';
import { createLogger } from '@/core/logging/logger';
import { getCached, putCached } from '@/core/offline/entity-cache';
import { color, radius, size, space } from '@/core/theme/tokens';
import {
  formatPhoneDisplay,
  resolveContactName,
  type Contact,
} from '@/features/contacts/domain/entities/contact';
import { buildContactActions } from '@/features/contacts/domain/utils/contact-actions';
import { orderedPhoneMethods } from '@/features/contacts/domain/utils/order-phone-methods';
import {
  isPhoneVerified,
  useFriendshipsStore,
} from '@/features/friendships/presentation/stores/friendships-store';
import { confirmBlockUser, unblockUser } from '@/features/friendships/presentation/block-user';
import {
  unblockOpensAt,
  useUserBlocksStore,
} from '@/features/friendships/presentation/stores/user-blocks-store';
import { useTourFiltersStore } from '@/features/tours/presentation/stores/tour-filters-store';

import { confirmDeleteContact } from './contact-delete';
import { contactPhones, useContactLinks } from './contact-links';
import { useContactsStore } from './stores/contacts-store';

const log = createLogger('ContactDetail');

/** "Save contact only" is remembered per contact on this device (friendships connect prompt). */
const dismissedKey = () => `connect-dismissed:${sessionUser.getState().id}`;

async function dismissConnect(contactId: string) {
  const ids = (await getCached<string[]>(dismissedKey()).catch(() => undefined)) ?? [];
  await putCached(dismissedKey(), [...new Set([...ids, contactId])]).catch(() => {});
}

/**
 * Who a contact's numbers belong to on TourenBuddy, once per open (friendships): the first one a
 * non-friend user has registered, for the connect prompt, unless a request to them is pending.
 */
function useMatchedUser(contact: Contact | undefined, friend: string | null) {
  const phones = contact ? contactPhones(contact).join(',') : '';
  const key = `${contact?.id}|${phones}|${friend}`;
  // Answers are kept with the question they answer, so a stale one never shows.
  const [found, setFound] = useState<{ key: string; userId: string } | null>(null);
  const [dismissedIds, setDismissedIds] = useState<string[] | null>(null);
  const outgoing = useFriendshipsStore((s) => s.outgoing);
  const matched = found?.key === key ? found.userId : null;
  const dismissed = !contact || !dismissedIds || dismissedIds.includes(contact.id);

  useEffect(() => {
    let live = true;
    if (!contact || friend || !isPhoneVerified()) return;
    void (async () => {
      const ids = (await getCached<string[]>(dismissedKey()).catch(() => undefined)) ?? [];
      if (live) setDismissedIds(ids);
      for (const phone of phones.split(',').filter(Boolean)) {
        const userId = await useFriendshipsStore.getState().findUserByPhone(phone);
        if (!live) return;
        if (userId && !useFriendshipsStore.getState().friendUserIds.has(userId)) {
          setFound({ key, userId });
          return;
        }
      }
    })();
    return () => {
      live = false;
    };
    // Re-run when the numbers change, not on every contact edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const pending =
    !!matched && outgoing.some((r) => r.toUserId === matched && r.status === 'pending');
  return {
    matched,
    pending,
    dismissed,
    dismiss: () => {
      if (!contact) return;
      setDismissedIds((ids) => [...(ids ?? []), contact.id]);
      void dismissConnect(contact.id);
    },
  };
}

/**
 * A contact (contacts): name and how they are linked on TourenBuddy, quick actions (message,
 * call, WhatsApp, their tours), the numbers with a menu each, the connect prompt for a number
 * that belongs to a TourenBuddy user, block, and delete with the friendship warnings.
 */
export function ContactDetailPage({
  id,
  onGone,
  onClose,
}: {
  id: string;
  onGone: () => void;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { formatDate } = useFormatter();
  const contact = useContactsStore((s) => s.contacts.find((c) => c.id === id));
  const hasLoaded = useContactsStore((s) => s.hasLoaded);
  const links = useContactLinks();
  const friend = contact ? links.friendOf(contact) : null;
  const blocked = contact ? links.isBlocked(contact) : false;
  const blockedIds = useUserBlocksStore((s) => s.blockedUserIds);
  const blocks = useUserBlocksStore((s) => s.blocks);
  const incoming = useFriendshipsStore((s) => s.incoming);
  const connect = useMatchedUser(contact, friend);
  const [busy, setBusy] = useState(false);

  // Deleted here or elsewhere: back to the list.
  useEffect(() => {
    if (hasLoaded && !contact) onGone();
  }, [hasLoaded, contact, onGone]);

  if (!contact) {
    return (
      <Page title={t('contacts.detailView.title')} onClose={onClose}>
        {hasLoaded ? <EmptyState icon="search_off" title={t('tours.infoSheet.gone')} /> : null}
      </Page>
    );
  }

  const name = resolveContactName(contact);
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  const reach = buildContactActions(contact)[0] ?? null;
  const emails = contact.contactMethods.filter((m) => m.methodType === 'email');
  const phones = orderedPhoneMethods(contact);
  const isFriend = !!friend && !blocked;
  const blockTarget = friend ?? connect.matched;
  const blockedUser = blockTarget && blockedIds.has(blockTarget) ? blockTarget : null;
  const unblockAt = unblockOpensAt(blocks.find((b) => b.blockedUserId === blockedUser));
  const acceptId = connect.matched
    ? (incoming.find((r) => r.fromUserId === connect.matched && r.status === 'pending')?.id ?? null)
    : null;

  const open = (url: string) =>
    void Linking.openURL(url).catch((error) => log.warn('Open link failed', error));

  const showTours = () => {
    if (!friend) return;
    useTourFiltersStore.getState().showFriendTours(friend);
    router.navigate('/');
    router.push({ pathname: '/tours', params: { tab: 'friends' } });
  };

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      log.error('Contact action failed', error);
      Alert.alert(failure);
    } finally {
      setBusy(false);
    }
  }

  const quick: { key: string; icon: IconName; label: string; onPress: () => void }[] = [
    ...(reach
      ? [
          {
            key: 'message',
            icon: 'chat' as const,
            label: t('contacts.detailView.messageAction'),
            onPress: () => open(`sms:${reach.call.slice(4)}`),
          },
          {
            key: 'call',
            icon: 'call' as const,
            label: t('contacts.detailView.callAction'),
            onPress: () => open(reach.call),
          },
          {
            key: 'whatsapp',
            icon: 'phone' as const,
            label: t('contacts.detailView.whatsAppAction'),
            onPress: () => open(reach.whatsApp),
          },
        ]
      : []),
    ...(emails[0]
      ? [
          {
            key: 'mail',
            icon: 'mail' as const,
            label: t('contacts.detailView.mailAction'),
            onPress: () => open(`mailto:${emails[0]!.value}`),
          },
        ]
      : []),
    ...(isFriend
      ? [
          {
            key: 'tours',
            icon: 'hiking' as const,
            label: t('contacts.detailView.showToursBtn'),
            onPress: showTours,
          },
        ]
      : []),
  ];

  const hero = (
    <View style={styles.hero}>
      <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no">
        <Text variant="title" style={styles.initials}>
          {initials(name)}
        </Text>
      </View>
      <Text variant="title" role="heading" style={styles.center}>
        {name}
      </Text>
      {contact.displayName && contact.displayName !== fullName ? (
        <Text style={[styles.muted, styles.center]}>{fullName}</Text>
      ) : null}
      {blocked ? (
        <View style={styles.badge}>
          <Icon name="block" size={16} color={color.error} />
          <Text variant="caption" style={{ color: color.error }}>
            {t('blocks.tooltip')}
          </Text>
        </View>
      ) : isFriend ? (
        <View style={styles.badge}>
          <Icon name="verified" size={16} color={color.primary} />
          <Text variant="caption" style={{ color: color.primary }}>
            {t('friendships.tooltip')}
          </Text>
        </View>
      ) : null}
      {quick.length ? (
        <View style={styles.quick}>
          {quick.map((action) => (
            <Pressable
              key={action.key}
              role="button"
              aria-label={action.label}
              onPress={action.onPress}
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            >
              <Icon name={action.icon} color={color.primary} />
              <Text variant="caption" style={{ color: color.primary }} numberOfLines={1}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  const phoneMenu = (value: string, methodId: string, primary: boolean): RowAction[] => {
    const digits = value.replace(/^\+/, '');
    return [
      {
        label: t('contacts.detailView.callAction'),
        icon: 'call',
        onPress: () => open(`tel:${value}`),
      },
      {
        label: t('contacts.detailView.messageAction'),
        icon: 'chat',
        onPress: () => open(`sms:${value}`),
      },
      {
        label: t('contacts.detailView.whatsAppAction'),
        icon: 'phone',
        onPress: () => open(`https://wa.me/${digits}`),
      },
      {
        label: t('contacts.detailView.copyAction'),
        icon: 'content_copy',
        onPress: () => void Clipboard.setStringAsync(value),
      },
      ...(!primary && phones.length > 1
        ? [
            {
              label: t('contacts.detailView.setAsPrimaryTooltip'),
              icon: 'star' as const,
              onPress: () =>
                void run(
                  () => useContactsStore.getState().setPrimaryPhoneOnContact(id, methodId),
                  t('contacts.detailView.saveFailed'),
                ),
            },
          ]
        : []),
    ];
  };

  return (
    <Page
      title={name}
      titleInHeader
      onClose={onClose}
      header={hero}
      actions={[
        {
          id: 'edit',
          label: t('contacts.detailView.editBtn'),
          icon: 'edit',
          titled: true,
          onPress: () => router.push({ pathname: '/contact/edit', params: { id } }),
        },
      ]}
    >
      {phones.length ? (
        <ListSection title={t('contacts.form.phonesLabel')}>
          {phones.map((method) => (
            <ListRow
              key={method.id}
              title={formatPhoneDisplay(method.value)}
              subtitle={
                method.isValid
                  ? [
                      method.label,
                      method.isPrimary && phones.length > 1
                        ? t('contacts.detailView.primaryPhoneTooltip')
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || undefined
                  : t('contacts.detailView.invalidPhoneHint')
              }
              icon={method.isValid ? (method.isPrimary ? 'star_filled' : 'phone') : 'warning'}
              iconColor={method.isValid ? undefined : color.error}
              menu={
                method.isValid ? phoneMenu(method.value, method.id, method.isPrimary) : undefined
              }
              onPress={
                method.isValid
                  ? undefined
                  : () => router.push({ pathname: '/contact/edit', params: { id } })
              }
            />
          ))}
        </ListSection>
      ) : null}
      {emails.length ? (
        <ListSection title={t('contacts.detailView.emailTypeBtn')}>
          {emails.map((method) => (
            <ListRow
              key={method.id}
              title={method.value}
              subtitle={method.label ?? undefined}
              icon="mail"
              onPress={() => open(`mailto:${method.value}`)}
              chevron={false}
              contextActions={[
                {
                  label: t('contacts.detailView.copyAction'),
                  icon: 'content_copy',
                  onPress: () => void Clipboard.setStringAsync(method.value),
                },
              ]}
            />
          ))}
        </ListSection>
      ) : null}
      {!phones.length && !emails.length ? (
        <ListSection footer={t('contacts.actionMenu.noMethods')}>
          <ListRow
            title={t('contacts.detailView.addMethodBtn')}
            icon="add"
            onPress={() => router.push({ pathname: '/contact/edit', params: { id } })}
          />
        </ListSection>
      ) : null}
      {connect.matched && !blockedUser && (connect.pending || !connect.dismissed) ? (
        <ListSection
          title={connect.pending ? undefined : t('friendships.prompt.title')}
          footer={connect.pending ? undefined : t('friendships.prompt.securityNote')}
        >
          {connect.pending ? (
            <ListRow title={t('friendships.requestSent')} icon="check_circle" chevron={false} />
          ) : (
            <>
              <ListRow
                title={acceptId ? t('friendships.accept') : t('friendships.sendRequest')}
                icon="person_add"
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const store = useFriendshipsStore.getState();
                    if (acceptId) await store.accept(acceptId);
                    else await store.sendRequest(connect.matched!);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  }, t('friendships.sendFailedRetry'))
                }
              />
              <ListRow
                title={t('friendships.justSaveContact')}
                chevron={false}
                onPress={connect.dismiss}
              />
            </>
          )}
        </ListSection>
      ) : null}
      {blockTarget ? (
        <ListSection>
          {blockedUser ? (
            // The 48 hours before an unblock show here, not as a refusal after the tap.
            <ListRow
              title={t('blocks.unblockAction')}
              subtitle={
                unblockAt
                  ? t('blocks.unblockFrom', {
                      date: formatDate(unblockAt, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }),
                    })
                  : undefined
              }
              icon="block"
              disabled={busy || !!unblockAt}
              onPress={() => void unblockUser(t, blockedUser)}
            />
          ) : (
            <ListRow
              title={t('blocks.blockAction')}
              icon="block"
              destructive
              disabled={busy}
              onPress={() => confirmBlockUser(t, blockTarget)}
            />
          )}
        </ListSection>
      ) : null}
      <ListSection>
        <ListRow
          title={t('contacts.detailView.deleteBtn')}
          icon="delete"
          destructive
          disabled={busy}
          onPress={() => void confirmDeleteContact(t, id, friend)}
        />
      </ListSection>
    </Page>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

const AVATAR = 72;

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.xxs, paddingVertical: space.sm },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.secondaryContainer,
    marginBottom: space.xs,
  },
  initials: { color: color.onSecondaryContainer },
  center: { textAlign: 'center' },
  muted: { color: color.onSurfaceVariant },
  badge: { flexDirection: 'row', alignItems: 'center', gap: space.xxs },
  quick: { flexDirection: 'row', gap: space.xs, marginTop: space.sm, alignSelf: 'stretch' },
  tile: {
    flex: 1,
    minHeight: size.touch + space.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxs,
    borderRadius: radius.sm,
    backgroundColor: color.background,
    paddingHorizontal: space.xxs,
  },
  tilePressed: { backgroundColor: color.secondaryContainerPressed },
});
