import type { Contact } from '@/features/contacts/domain/entities/contact';
import type { ContactMethod } from '@/features/contacts/domain/entities/contact-method';

/**
 * Returns phone methods with the primary first, remaining in insertion order.
 * `primaryId` overrides which phone leads (a staged switch shows the old order a moment longer).
 */
export function orderedPhoneMethods(contact: Contact, primaryId?: string | null): ContactMethod[] {
  const phones = contact.contactMethods.filter((m) => m.methodType === 'phone');
  const leadId = primaryId ?? phones.find((m) => m.isPrimary)?.id;
  const primary = phones.find((m) => m.id === leadId);
  if (!primary) return phones;
  return [primary, ...phones.filter((m) => m.id !== primary.id)];
}
