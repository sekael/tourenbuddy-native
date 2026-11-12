import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { ListRow, ListSection, PickerRow, TextRow } from '@/core/adaptive/list';
import { Page } from '@/core/adaptive/screen';
import { sessionUser } from '@/core/auth/session-user';
import { DuplicateContactAcrossContactsError } from '@/core/exceptions';
import { newId } from '@/core/files';
import { createLogger } from '@/core/logging/logger';
import { normalizePhone } from '@/core/utils/phone-normalize';
import {
  formatPhoneDisplay,
  resolveContactName,
  type Contact,
} from '@/features/contacts/domain/entities/contact';
import type { ContactMethod } from '@/features/contacts/domain/entities/contact-method';
import { orderedPhoneMethods } from '@/features/contacts/domain/utils/order-phone-methods';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';

import { phoneKey } from './contact-links';
import { useContactsStore } from './stores/contacts-store';

const log = createLogger('ContactForm');

type Row = { id: string; value: string; label: string };

const rowOf = (m: ContactMethod): Row => ({
  id: m.id,
  value: m.methodType === 'phone' ? formatPhoneDisplay(m.value) : m.value,
  label: m.label ?? '',
});
const blankRow = (): Row => ({ id: newId(), value: '', label: '' });

/**
 * Adds or edits a contact (contacts, contact-methods): names, phone numbers with their labels and
 * the primary one, email addresses. Save checks every number, refuses one already on another
 * contact (offering to edit that one), warns before a changed or removed number ends a friendship
 * or cancels a pending request, then saves the whole contact at once. Clearing a field removes it.
 */
export function ContactFormScreen({ id }: { id: string | null }) {
  const { t } = useTranslation();
  const existing = useContactsStore((s) => (id ? s.contacts.find((c) => c.id === id) : undefined));
  const [first, setFirst] = useState(existing?.firstName ?? '');
  const [last, setLast] = useState(existing?.lastName ?? '');
  const [display, setDisplay] = useState(existing?.displayName ?? '');
  const [phones, setPhones] = useState<Row[]>(() => {
    const rows = existing ? orderedPhoneMethods(existing).map(rowOf) : [];
    return rows.length ? rows : [blankRow()];
  });
  const [primaryId, setPrimaryId] = useState<string>(
    () =>
      existing?.contactMethods.find((m) => m.methodType === 'phone' && m.isPrimary)?.id ??
      phones[0]!.id,
  );
  const [emails, setEmails] = useState<Row[]>(
    () => existing?.contactMethods.filter((m) => m.methodType === 'email').map(rowOf) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const edit =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v);
      setDirty(true);
    };
  const editRow =
    (setter: typeof setPhones, rowId: string, field: 'value' | 'label') => (text: string) => {
      setter((rows) => rows.map((r) => (r.id === rowId ? { ...r, [field]: text } : r)));
      setErrors((e) => ({ ...e, [rowId]: '' }));
      setDirty(true);
    };

  function close() {
    if (!dirty) {
      router.back();
      return;
    }
    Alert.alert(t('tours.form.discardTitle'), undefined, [
      { text: t('tours.creation.keepEditing'), style: 'cancel' },
      { text: t('contacts.shared.discardBtn'), style: 'destructive', onPress: () => router.back() },
    ]);
  }

  const confirm = (title: string, body: string | undefined, ok: string) =>
    new Promise<boolean>((resolve) =>
      Alert.alert(title, body, [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: ok, style: 'destructive', onPress: () => resolve(true) },
      ]),
    );

  async function save() {
    const store = useContactsStore.getState();
    const nextErrors: Record<string, string> = {};
    if (!first.trim()) nextErrors.first = t('contacts.form.firstNameRequired');

    const filled = phones.filter((p) => p.value.trim());
    const normalized = new Map<string, string>();
    for (const row of filled) {
      const result = normalizePhone(row.value.trim());
      if (result.ok) normalized.set(row.id, result.e164);
      else nextErrors[row.id] = t('contacts.form.invalidPhone');
    }
    const values = [...normalized.values()];
    filled.forEach((row) => {
      const value = normalized.get(row.id);
      if (value && values.indexOf(value) !== values.lastIndexOf(value)) {
        nextErrors[row.id] = t('contacts.errors.duplicateMethod');
      }
    });
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    // A number already on another contact: edit that one instead.
    for (const value of values) {
      const other = store.findContactByMethodValue('phone', value, id ?? undefined);
      if (other) {
        Alert.alert(
          t('contacts.shared.duplicateTitle'),
          t('contacts.shared.duplicateText', { name: resolveContactName(other) }),
          [
            { text: t('contacts.shared.discardBtn'), style: 'cancel' },
            {
              text: t('contacts.shared.editExistingBtn'),
              onPress: () =>
                router.replace({ pathname: '/contact/edit', params: { id: other.id } }),
            },
          ],
        );
        return;
      }
    }

    // Numbers that leave this contact may end a friendship or cancel a pending request.
    const evictFriends: string[] = [];
    const before = existing?.contactMethods.filter((m) => m.methodType === 'phone') ?? [];
    for (const old of before.filter((m) => !values.includes(phoneKey(m.value)))) {
      const relation = await store.relationshipsForPhone(old.value).catch(() => null);
      if (!relation?.userId || !(relation.hasFriendship || relation.hasPending)) continue;
      const changed = normalized.has(old.id);
      const which =
        relation.hasFriendship && relation.hasPending
          ? 'FriendAndPending'
          : relation.hasFriendship
            ? 'Friend'
            : 'Pending';
      const ok = await confirm(
        changed ? t('contacts.detailView.saveBtn') : t('contacts.detailView.removeMethodConfirm'),
        t(`contacts.detailView.${changed ? 'editEvict' : 'removeMethod'}${which}Warning`),
        changed ? t('contacts.detailView.confirmSaveBtn') : t('contacts.detailView.removeBtn'),
      );
      if (!ok) return;
      if (relation.hasFriendship) evictFriends.push(relation.userId);
    }

    const contactId = existing?.id ?? newId();
    const primary = normalized.has(primaryId)
      ? primaryId
      : (filled.find((p) => normalized.has(p.id))?.id ?? null);
    const contact: Contact = {
      id: contactId,
      userId: existing?.userId ?? sessionUser.getState().id ?? '',
      firstName: first.trim(),
      lastName: last.trim() || null,
      displayName: display.trim() || null,
      updatedAt: existing?.updatedAt ?? null,
      contactMethods: [
        ...filled.map((row) => ({
          id: row.id,
          contactId,
          methodType: 'phone' as const,
          value: normalized.get(row.id)!,
          label: row.label.trim() || null,
          isPrimary: row.id === primary,
          isValid: true,
        })),
        ...emails
          .filter((e) => e.value.trim())
          .map((row) => ({
            id: row.id,
            contactId,
            methodType: 'email' as const,
            value: row.value.trim(),
            label: row.label.trim() || null,
            isPrimary: false,
            isValid: true,
          })),
      ],
    };

    setSaving(true);
    try {
      await store.saveContact(contact);
      for (const userId of evictFriends)
        await useFriendshipsStore.getState().removeFriendship(userId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // A new contact opens, so a number on TourenBuddy offers to connect right away.
      if (existing) router.back();
      else router.replace({ pathname: '/contact/[id]', params: { id: contactId } });
    } catch (error) {
      log.error('Save contact failed', error);
      Alert.alert(
        error instanceof DuplicateContactAcrossContactsError
          ? t('contacts.shared.duplicateGenericText')
          : t('contacts.detailView.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  }

  const filledPhones = phones.filter((p) => p.value.trim());

  return (
    <Page
      form
      title={existing ? resolveContactName(existing) : t('contacts.addDialog.title')}
      cancel={{ label: t('common.cancel'), onPress: close }}
      confirm={{
        label: t('contacts.detailView.saveBtn'),
        onPress: () => void save(),
        disabled: saving || !first.trim(),
      }}
    >
      <ListSection>
        <TextRow
          label={t('contacts.form.firstNameLabel')}
          placeholder={t('contacts.form.firstNamePlaceholder')}
          value={first}
          onChangeText={edit(setFirst)}
          autoCapitalize="words"
          textContentType="givenName"
          error={errors.first || undefined}
        />
        <TextRow
          label={t('contacts.form.lastNameLabel')}
          placeholder={t('contacts.form.lastNamePlaceholder')}
          value={last}
          onChangeText={edit(setLast)}
          autoCapitalize="words"
          textContentType="familyName"
        />
        <TextRow
          label={t('contacts.form.displayNameLabel')}
          placeholder={t('contacts.form.displayNamePlaceholder')}
          value={display}
          onChangeText={edit(setDisplay)}
          autoCapitalize="words"
          textContentType="nickname"
        />
      </ListSection>
      <ListSection title={t('contacts.form.phonesLabel')} footer={t('contacts.form.clearToRemove')}>
        {phones.flatMap((row) => [
          <TextRow
            key={`${row.id}:value`}
            label={t('contacts.detailView.phoneTypeBtn')}
            placeholder={t('contacts.form.phonePlaceholder')}
            value={row.value}
            onChangeText={editRow(setPhones, row.id, 'value')}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            error={errors[row.id] || undefined}
          />,
          <TextRow
            key={`${row.id}:label`}
            label={t('contacts.detailView.labelPlaceholder')}
            placeholder={t('contacts.form.labelPlaceholder')}
            value={row.label}
            onChangeText={editRow(setPhones, row.id, 'label')}
            autoCapitalize="words"
          />,
        ])}
        <ListRow
          title={t('contacts.form.addPhoneBtn')}
          icon="add"
          chevron={false}
          onPress={() => setPhones((rows) => [...rows, blankRow()])}
        />
      </ListSection>
      {filledPhones.length > 1 ? (
        <ListSection>
          <PickerRow
            title={t('contacts.form.primaryPhoneTooltip')}
            value={filledPhones.some((p) => p.id === primaryId) ? primaryId : filledPhones[0]!.id}
            options={filledPhones.map((p) => ({
              value: p.id,
              label: p.label.trim() ? `${p.value} (${p.label.trim()})` : p.value,
            }))}
            onChange={edit(setPrimaryId)}
          />
        </ListSection>
      ) : null}
      <ListSection title={t('contacts.detailView.emailTypeBtn')}>
        {emails.map((row) => (
          <TextRow
            key={row.id}
            label={t('contacts.detailView.emailTypeBtn')}
            placeholder={t('contacts.detailView.emailPlaceholder')}
            value={row.value}
            onChangeText={editRow(setEmails, row.id, 'value')}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
        ))}
        <ListRow
          title={t('contacts.form.addEmailBtn')}
          icon="add"
          chevron={false}
          onPress={() => setEmails((rows) => [...rows, blankRow()])}
        />
      </ListSection>
    </Page>
  );
}
