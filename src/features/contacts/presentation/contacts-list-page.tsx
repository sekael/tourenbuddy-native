import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, Platform } from 'react-native';

import { EmptyState, ListRow, ListSection, type RowAction } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { VCardImportError } from '@/core/exceptions';
import { createLogger } from '@/core/logging/logger';
import { color } from '@/core/theme/tokens';
import {
  formatPhoneDisplay,
  getPrimaryPhone,
  resolveContactName,
  type Contact,
} from '@/features/contacts/domain/entities/contact';
import {
  isPhoneVerified,
  useFriendshipsStore,
} from '@/features/friendships/presentation/stores/friendships-store';

import {
  importContacts,
  pickDeviceContact,
  pickVCardFile,
  type ImportResult,
} from './contact-import';
import { confirmDeleteContact } from './contact-delete';
import { phoneKey, useContactLinks } from './contact-links';
import { useContactsStore } from './stores/contacts-store';

const log = createLogger('ContactsList');

/** iOS Contacts' index: by the first letter of the shown name, "#" for the rest. */
function sectionKey(name: string) {
  const letter = name.trim().charAt(0).toLocaleUpperCase();
  return /\p{L}/u.test(letter) ? letter.normalize('NFD').charAt(0) : '#';
}

function matches(contact: Contact, query: string) {
  const q = query.trim().toLocaleLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, '');
  return (
    [contact.firstName, contact.lastName, contact.displayName].some((v) =>
      v?.toLocaleLowerCase().includes(q),
    ) ||
    (digits.length > 2 &&
      contact.contactMethods.some((m) => m.value.replace(/\D/g, '').includes(digits)))
  );
}

/**
 * The Contacts tab (contacts): friend requests on top, then every contact under its letter, a
 * friend marked as such and a blocked one in red; search by name or number; "+" adds one by hand,
 * picks one from the phone's contacts or imports a vCard file.
 */
export function ContactsListPage({
  onOpen,
  onRequests,
  onImported,
}: {
  onOpen: (id: string) => void;
  onRequests: () => void;
  onImported: (results: ImportResult[]) => void;
}) {
  const { t } = useTranslation();
  const contacts = useContactsStore((s) => s.contacts);
  const hasLoaded = useContactsStore((s) => s.hasLoaded);
  const incoming = useFriendshipsStore((s) => s.incoming);
  const links = useContactLinks();
  const [query, setQuery] = useState('');
  const pendingCount = incoming.filter((r) => r.status === 'pending').length;

  const sections = useMemo(() => {
    const groups = new Map<string, Contact[]>();
    const sorted = contacts
      .filter((c) => matches(c, query))
      .sort((a, b) => resolveContactName(a).localeCompare(resolveContactName(b)));
    for (const contact of sorted) {
      const key = sectionKey(resolveContactName(contact));
      groups.set(key, [...(groups.get(key) ?? []), contact]);
    }
    return [...groups].sort(([a], [b]) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)));
  }, [contacts, query]);

  async function runImport(pick: () => Promise<Parameters<typeof importContacts>[0] | null>) {
    try {
      const items = await pick();
      if (!items?.length) return;
      const results = await importContacts(items);
      onImported(results);
    } catch (error) {
      if (error instanceof VCardImportError) {
        Alert.alert(
          t('contacts.addDialog.fileImportError'),
          t(`contacts.addDialog.fileError.${error.reason}`),
        );
        return;
      }
      log.error('Import failed', error);
      Alert.alert(t('contacts.addDialog.importError'));
    }
  }

  const addMenu: RowAction[] = [
    {
      label: t('contacts.list.addBtn'),
      icon: 'person_add',
      onPress: () => router.push('/contact/edit'),
    },
    ...(Platform.OS === 'web'
      ? []
      : [
          {
            label: t('contacts.addDialog.importContactsBtn'),
            icon: 'contacts' as const,
            onPress: () =>
              void runImport(async () => {
                const picked = await pickDeviceContact();
                return picked ? [picked] : null;
              }),
          },
        ]),
    {
      label: t('contacts.addDialog.importFileBtn'),
      icon: 'upload_file',
      onPress: () => void runImport(pickVCardFile),
    },
  ];

  return (
    <Page
      largeTitle
      title={t('contacts.list.title')}
      search={{ value: query, onChange: setQuery, prompt: t('contacts.list.searchPlaceholder') }}
      actions={[{ id: 'add', label: t('contacts.list.addBtn'), icon: 'add', menu: addMenu }]}
      onRefresh={async () => {
        await Promise.all([
          useContactsStore.getState().loadContacts(),
          useFriendshipsStore.getState().fetchAll(),
        ]);
      }}
    >
      {!query ? (
        <ListSection>
          <ListRow
            title={t('friendships.friendsListLink')}
            icon="group"
            badge={isPhoneVerified() ? pendingCount : undefined}
            onPress={onRequests}
          />
        </ListSection>
      ) : null}
      {hasLoaded && contacts.length === 0 ? (
        <EmptyState
          icon="contacts"
          title={t('contacts.list.emptyTitle')}
          description={t('contacts.list.emptySubtitle')}
          actionLabel={t('contacts.list.addBtn')}
          onAction={() => router.push('/contact/edit')}
        />
      ) : null}
      {contacts.length > 0 && sections.length === 0 ? (
        <EmptyState icon="search_off" title={t('contacts.list.noMatchesTitle')} />
      ) : null}
      {sections.map(([letter, rows]) => (
        <ListSection key={letter} title={letter}>
          {rows.map((contact) => {
            const friend = links.friendOf(contact);
            const blocked = links.isBlocked(contact);
            const phone = getPrimaryPhone(contact);
            const actions: RowAction[] = phone
              ? [
                  {
                    label: t('contacts.detailView.callAction'),
                    icon: 'call',
                    onPress: () => void Linking.openURL(`tel:${phone}`),
                  },
                  {
                    label: t('contacts.detailView.messageAction'),
                    icon: 'chat',
                    onPress: () => void Linking.openURL(`sms:${phone}`),
                  },
                ]
              : [];
            return (
              <ListRow
                key={contact.id}
                title={resolveContactName(contact)}
                subtitle={phone ? formatPhoneDisplay(phone) : undefined}
                icon={blocked ? 'block' : friend ? 'person_heart' : 'person'}
                iconColor={blocked ? color.error : friend ? color.primary : color.onSurfaceVariant}
                accessibilityLabel={[
                  resolveContactName(contact),
                  blocked ? t('blocks.tooltip') : friend ? t('friendships.tooltip') : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
                onPress={() => onOpen(contact.id)}
                swipeActions={[
                  {
                    label: t('contacts.detailView.deleteAction'),
                    icon: 'delete',
                    destructive: true,
                    onPress: () => void confirmDeleteContact(t, contact.id, friend),
                  },
                ]}
                contextActions={[
                  ...actions,
                  {
                    label: t('contacts.actionMenu.editBtn'),
                    icon: 'edit',
                    onPress: () =>
                      router.push({ pathname: '/contact/edit', params: { id: contact.id } }),
                  },
                ]}
              />
            );
          })}
        </ListSection>
      ))}
    </Page>
  );
}

/**
 * Who on TourenBuddy the imported cards' main numbers belong to, asked once for all of them
 * (contact-account-linking): row index and user, friends left out. The directory already leaves
 * out anyone the user blocks or who blocks them.
 */
function useImportMatches(results: ImportResult[]) {
  const [matches, setMatches] = useState<{ index: number; userId: string }[]>([]);
  useEffect(() => {
    const phones = [...new Set(results.flatMap((r) => (r.primaryPhone ? [r.primaryPhone] : [])))];
    if (!phones.length || !isPhoneVerified()) return;
    let live = true;
    void useFriendshipsStore
      .getState()
      .findUsersByPhones(phones)
      .then((found) => {
        if (!live) return;
        const byPhone = new Map(found.map((f) => [phoneKey(f.phone), f.userId]));
        const friends = useFriendshipsStore.getState().friendUserIds;
        setMatches(
          results.flatMap((r, index) => {
            const userId = r.primaryPhone ? byPhone.get(phoneKey(r.primaryPhone)) : undefined;
            return userId && !friends.has(userId) ? [{ index, userId }] : [];
          }),
        );
      });
    return () => {
      live = false;
    };
  }, [results]);
  return matches;
}

/**
 * What an import did (contact-import): the counts, then each card with its outcome; a card whose
 * number belongs to someone on TourenBuddy offers to connect, as a contact's page does.
 */
export function ImportResultsPage({ results }: { results: ImportResult[] }) {
  const { t } = useTranslation();
  const matches = useImportMatches(results);
  const incoming = useFriendshipsStore((s) => s.incoming);
  const [answered, setAnswered] = useState<Map<string, 'sent' | 'accepted' | 'dismissed'>>(
    new Map(),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const answer = (userId: string, state: 'sent' | 'accepted' | 'dismissed') =>
    setAnswered((m) => new Map(m).set(userId, state));

  async function connect(userId: string, acceptId: string | null) {
    setBusy(userId);
    try {
      const store = useFriendshipsStore.getState();
      if (acceptId) await store.accept(acceptId);
      else await store.sendRequest(userId);
      answer(userId, acceptId ? 'accepted' : 'sent');
    } catch (error) {
      log.error('Connect from import failed', error);
      Alert.alert(t('friendships.sendFailedRetry'));
    } finally {
      setBusy(null);
    }
  }

  const count = (pred: (r: ImportResult) => boolean) => results.filter(pred).length;
  const summary = [
    t('contacts.addDialog.summaryImported', { count: count((r) => r.status === 'imported') }),
    ...(['phoneDuplicate', 'nameDuplicate', 'unparseable'] as const)
      .map((reason) => ({ reason, n: count((r) => r.skipReason === reason) }))
      .filter(({ n }) => n > 0)
      .map(({ reason, n }) =>
        t(
          `contacts.addDialog.summary${reason.charAt(0).toUpperCase()}${reason.slice(1)}` as 'contacts.addDialog.summaryImported',
          { count: n },
        ),
      ),
  ].join(' · ');

  return (
    <Page title={t('contacts.addDialog.title')}>
      <ListSection footer={summary}>
        {results.map((result, index) => {
          const name = [result.firstName, result.lastName].filter(Boolean).join(' ');
          const phone = result.primaryPhone ? formatPhoneDisplay(result.primaryPhone) : null;
          const extra = result.extraPhoneCount
            ? t('contacts.addDialog.extraPhones', { count: result.extraPhoneCount })
            : null;
          const reason =
            result.skipReason === 'phoneDuplicate'
              ? t('contacts.addDialog.summaryPhoneDuplicateBadge')
              : result.skipReason
                ? t('contacts.addDialog.skippedLabel')
                : null;
          const discarded = result.rawPhoneNumbers.length
            ? `${t('contacts.addDialog.discardedPhones')}: ${result.rawPhoneNumbers.join(', ')}`
            : null;
          return (
            <ListRow
              key={`${name}:${index}`}
              title={name}
              subtitle={[reason, phone, extra, discarded].filter(Boolean).join(' · ') || undefined}
              icon={result.status === 'imported' ? 'check_circle' : 'warning'}
              iconColor={result.status === 'imported' ? color.success : color.onSurfaceVariant}
              chevron={false}
            />
          );
        })}
      </ListSection>
      {matches.map(({ index, userId }) => {
        const result = results[index]!;
        const state = answered.get(userId);
        if (state === 'dismissed') return null;
        // They asked first: the request becomes an accept (friendships).
        const acceptId =
          incoming.find((r) => r.fromUserId === userId && r.status === 'pending')?.id ?? null;
        return (
          <ListSection
            key={userId}
            title={t('friendships.prompt.title')}
            footer={state ? undefined : t('friendships.prompt.securityNote')}
          >
            <ListRow
              title={[result.firstName, result.lastName].filter(Boolean).join(' ')}
              subtitle={formatPhoneDisplay(result.primaryPhone!)}
              icon="person"
              chevron={false}
            />
            {state ? (
              <ListRow
                title={
                  state === 'sent' ? t('friendships.requestSent') : t('friendships.nowFriends')
                }
                icon="check_circle"
                iconColor={color.success}
                chevron={false}
              />
            ) : (
              <>
                <ListRow
                  title={acceptId ? t('friendships.accept') : t('friendships.sendRequest')}
                  icon="person_add"
                  chevron={false}
                  disabled={busy === userId}
                  onPress={() => void connect(userId, acceptId)}
                />
                <ListRow
                  title={t('friendships.justSaveContact')}
                  chevron={false}
                  disabled={busy === userId}
                  onPress={() => answer(userId, 'dismissed')}
                />
              </>
            )}
          </ListSection>
        );
      })}
    </Page>
  );
}
