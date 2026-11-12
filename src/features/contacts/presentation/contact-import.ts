import { presentContactPickerAsync } from 'expo-contacts/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { normalizePhone } from '@/core/utils/phone-normalize';
import { dedupePhones, dedupeRawPhones } from '@/features/contacts/domain/utils/dedupe';
import { parseContactName } from '@/features/contacts/domain/utils/parse-contact-name';
import { parseVCard } from '@/features/contacts/domain/utils/vcard';

import { useContactsStore, type PhoneEntry } from './stores/contacts-store';

export type ParsedImportItem = {
  firstName: string;
  lastName: string | null;
  phones: PhoneEntry[];
  /** Numbers that did not parse: shown as "Number not added". */
  rawPhoneNumbers?: string[];
};

export type ImportResult = {
  firstName: string;
  lastName: string | null;
  primaryPhone: string | null;
  extraPhoneCount: number;
  rawPhoneNumbers: string[];
  status: 'imported' | 'skipped';
  skipReason?: 'nameDuplicate' | 'unparseable' | 'phoneDuplicate';
};

/**
 * Imports parsed contacts (contact-import), the PWA's rules: a name already in the contacts is
 * skipped, so is a card whose every number failed to parse or already sits on another contact;
 * otherwise the contact is added with its usable, new numbers.
 */
export async function importContacts(items: ParsedImportItem[]): Promise<ImportResult[]> {
  const store = useContactsStore.getState();
  const results: ImportResult[] = [];
  for (const item of items) {
    const rawPhoneNumbers = item.rawPhoneNumbers ?? [];
    const base = { firstName: item.firstName, lastName: item.lastName, rawPhoneNumbers };
    const duplicate = useContactsStore
      .getState()
      .contacts.some(
        (c) =>
          c.firstName.toLowerCase() === item.firstName.toLowerCase() &&
          (c.lastName ?? '').toLowerCase() === (item.lastName ?? '').toLowerCase(),
      );
    if (duplicate) {
      results.push({
        ...base,
        primaryPhone: item.phones.find((p) => p.isPrimary)?.value ?? item.phones[0]?.value ?? null,
        extraPhoneCount: Math.max(0, item.phones.length - 1),
        status: 'skipped',
        skipReason: 'nameDuplicate',
      });
      continue;
    }
    if (item.phones.length === 0 && rawPhoneNumbers.length > 0) {
      results.push({
        ...base,
        primaryPhone: null,
        extraPhoneCount: 0,
        status: 'skipped',
        skipReason: 'unparseable',
      });
      continue;
    }
    const fresh = item.phones.filter((p) => !store.findContactByMethodValue('phone', p.value));
    if (item.phones.length > 0 && fresh.length === 0) {
      results.push({
        ...base,
        primaryPhone: null,
        extraPhoneCount: 0,
        status: 'skipped',
        skipReason: 'phoneDuplicate',
      });
      continue;
    }
    await store.addContact(item.firstName, item.lastName, null, fresh, 'import');
    results.push({
      ...base,
      primaryPhone: fresh.find((p) => p.isPrimary)?.value ?? fresh[0]?.value ?? null,
      extraPhoneCount: Math.max(0, fresh.length - 1),
      status: 'imported',
    });
  }
  return results;
}

/** A contact picked from the system's contacts (no Contacts permission: the picker runs out of process). */
export async function pickDeviceContact(): Promise<ParsedImportItem | null> {
  const picked = await presentContactPickerAsync();
  if (!picked) return null;
  const name =
    picked.firstName || picked.lastName
      ? { firstName: picked.firstName ?? '', lastName: picked.lastName || null }
      : parseContactName(picked.name ?? '');
  const phones: PhoneEntry[] = [];
  const raw: string[] = [];
  for (const entry of picked.phoneNumbers ?? []) {
    const value = (entry.number ?? '').trim();
    const normalized = normalizePhone(value);
    if (normalized.ok)
      phones.push({
        value: normalized.e164,
        label: entry.label ? labelOf(entry.label) : null,
        isPrimary: false,
      });
    else if (value) raw.push(value);
  }
  const unique = dedupePhones(phones);
  return {
    firstName: name.firstName || picked.name || '',
    lastName: name.lastName,
    phones: unique,
    rawPhoneNumbers: dedupeRawPhones(raw),
  };
}

/** The system's phone labels ("mobile", "_$!<Home>!$_") as the PWA stores them. */
function labelOf(label: string): string | null {
  const plain = label.replace(/^_\$!<(.*)>!\$_$/, '$1').toLowerCase();
  if (plain === 'mobile' || plain === 'iphone' || plain === 'cell') return 'Mobile';
  if (plain === 'home') return 'Home';
  if (plain === 'work') return 'Work';
  return null;
}

/** A .vcf picked in Files: one file, which may hold many cards. Throws VCardImportError. */
export async function pickVCardFile(): Promise<ParsedImportItem[] | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['text/vcard', 'text/x-vcard', 'text/directory', 'text/plain'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;
  const text = await new File(result.assets[0].uri).text();
  return parseVCard(text);
}
