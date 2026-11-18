import type { Contact } from '@/features/contacts/domain/entities/contact';
import { resolveContactName } from '@/features/contacts/domain/entities/contact';

/**
 * The one naming scheme for a registered user the viewer is connected to: the name the
 * VIEWER saved them under. A friendship always resolves to a contact by construction —
 * you can only befriend someone you have saved, accepting a request auto-creates the
 * contact, and deleting a contact terminates the friendship in the database — so the
 * contact name is not a *preferred* name for a friend, it is the only one guaranteed.
 *
 * Returns `null` when the chain breaks (unknown phone, no matching contact, empty name),
 * so the CALLER owns the fallback string and this module stays free of `vue-i18n`.
 * `findContact` is injected rather than imported, so the domain takes no runtime
 * dependency on the contacts feature. Pass `contactsStore.findContactByMethodValue`
 * bound to 'phone' — it normalizes both sides, so a contact imported in local format
 * still matches an E.164 query.
 */
export function resolveFriendName(
  userId: string | null,
  phoneMap: Map<string, string>,
  findContact: (phone: string) => Contact | undefined,
): string | null {
  if (!userId) return null;
  const phone = phoneMap.get(userId);
  if (!phone) return null;
  const contact = findContact(phone);
  if (!contact) return null;
  return resolveContactName(contact).trim() || null;
}
