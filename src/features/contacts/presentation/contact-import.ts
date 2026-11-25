import { presentContactPickerAsync } from 'expo-contacts/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { normalizePhone } from '@/core/utils/phone-normalize';
import { dedupePhones, dedupeRawPhones } from '@/features/contacts/domain/utils/dedupe';
import { parseContactName } from '@/features/contacts/domain/utils/parse-contact-name';
import { parseVCard, UNNAMED_CONTACT } from '@/features/contacts/domain/utils/vcard';

import type { ParsedImportItem } from './import-contacts';
import type { PhoneEntry } from './stores/contacts-store';

export { importContacts, type ImportResult, type ParsedImportItem } from './import-contacts';

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
    // A card with a company only, or no name at all: named as a vCard without one is.
    firstName: name.firstName || picked.name || UNNAMED_CONTACT,
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
