import type { Contact } from '@/features/contacts/domain/entities/contact';
import { contactPhones } from '@/features/contacts/presentation/contact-links';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';

/** Whether the caller blocks this contact: its linked friend, or any of its phones. */
export function useContactBlocked(contact: Contact, linkedFriendUserId?: string | null): boolean {
  const blockedUserIds = useUserBlocksStore((s) => s.blockedUserIds);
  const blockedPhones = useUserBlocksStore((s) => s.blockedPhones);
  if (linkedFriendUserId && blockedUserIds.has(linkedFriendUserId)) return true;
  return contactPhones(contact).some((p) => blockedPhones.has(p));
}
