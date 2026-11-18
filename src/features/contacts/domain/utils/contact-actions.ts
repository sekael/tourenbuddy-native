import type { Contact } from '@/features/contacts/domain/entities/contact';
import { formatPhoneDisplay } from '@/features/contacts/domain/entities/contact';
import { orderedPhoneMethods } from './order-phone-methods';

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export interface ContactAction {
  methodId: string;
  label: string;
  call: string;
  whatsApp: string;
}

/** Returns one action entry per valid phone method, ordered primary-first. */
export function buildContactActions(contact: Contact): ContactAction[] {
  return orderedPhoneMethods(contact)
    .filter((m) => m.isValid && E164_REGEX.test(m.value))
    .map((m) => {
      const digits = m.value.slice(1);
      return {
        methodId: m.id,
        label: m.label ?? formatPhoneDisplay(m.value),
        call: `tel:${m.value}`,
        whatsApp: `https://wa.me/${digits}`,
      };
    });
}
