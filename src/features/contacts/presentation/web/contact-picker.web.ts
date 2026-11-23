import { normalizePhone } from '@/core/utils/phone-normalize';
import type { ParsedImportItem } from '@/features/contacts/presentation/import-contacts';
import type { PhoneEntry } from '@/features/contacts/presentation/stores/contacts-store';
import { dedupePhones, dedupeRawPhones } from '@/features/contacts/domain/utils/dedupe';
import { parseContactName } from '@/features/contacts/domain/utils/parse-contact-name';
import { parseVCard } from '@/features/contacts/domain/utils/vcard';

type ContactsManager = {
  select: (
    props: string[],
    opts: { multiple: boolean },
  ) => Promise<{ name: string[]; tel: string[] }[]>;
};

/** Whether the Contact Picker API is available (Android Chrome/Edge). */
export const isContactPickerSupported = 'contacts' in navigator && 'ContactsManager' in window;

/** Contacts picked with the browser's Contact Picker; empty when cancelled or unsupported. */
export async function pickContacts(): Promise<ParsedImportItem[]> {
  if (!isContactPickerSupported) return [];
  try {
    const manager = (navigator as unknown as { contacts: ContactsManager }).contacts;
    const picked = await manager.select(['name', 'tel'], { multiple: true });
    return picked.map((entry) => {
      const phones: PhoneEntry[] = [];
      const raw: string[] = [];
      for (const value of entry.tel ?? []) {
        const trimmed = value.trim();
        const normalized = normalizePhone(trimmed);
        if (normalized.ok)
          phones.push({ value: normalized.e164, label: null, isPrimary: phones.length === 0 });
        else if (trimmed) raw.push(trimmed);
      }
      return {
        ...parseContactName(entry.name[0] ?? ''),
        phones: dedupePhones(phones),
        rawPhoneNumbers: dedupeRawPhones(raw),
      };
    });
  } catch {
    return [];
  }
}

/** A picked .vcf file's contacts. Throws VCardImportError. */
export const parseVCardFile = async (file: File) => parseVCard(await file.text());
