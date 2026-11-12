import type { Contact } from '@/features/contacts/domain/entities/contact';

/** Abstract repository interface for contact operations. */
export interface ContactsRepository {
  fetchContacts: () => Promise<Contact[]>;
  /** Idempotent create of the whole contact aggregate (contact + methods), client-minted ids. */
  createContactFull: (contact: Contact) => Promise<Contact>;
  /** Update-only aggregate write; null when the contact is gone (never resurrects). */
  updateContactFull: (contact: Contact) => Promise<Contact | null>;
  /** Current server `updated_at`, or null if the row is gone — the LWW read (DC5). */
  getContactUpdatedAt: (id: string) => Promise<string | null>;
  deleteContact: (id: string) => Promise<void>;
}
