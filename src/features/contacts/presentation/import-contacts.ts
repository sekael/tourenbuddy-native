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
