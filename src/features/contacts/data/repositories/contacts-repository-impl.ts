import type { Contact } from '@/features/contacts/domain/entities/contact';
import type { ContactMethod } from '@/features/contacts/domain/entities/contact-method';
import type { ContactsRepository } from '@/features/contacts/domain/repositories/contacts-repository';
import {
  DuplicateContactAcrossContactsError,
  DuplicateContactMethodError,
} from '@/core/exceptions';
import { normalizePhone } from '@/core/utils/phone-normalize';
import { supabase } from '@/core/supabase';
import { contactRowSchema } from '@/features/contacts/data/models/contact-schema';

/** E.164 is the stored invariant for phones (there is no `is_valid` column) — enforce it here. */
function resolveMethodValue(method: Pick<ContactMethod, 'methodType' | 'value'>): string {
  if (method.methodType !== 'phone') return method.value;
  const result = normalizePhone(method.value);
  if (!result.ok) throw new Error(`Invalid phone number: "${method.value}"`);
  return result.e164;
}

function mapContactWriteError(error: { code: string; message: string }): Error {
  if (error.code === '23505' && error.message.includes('contact_methods_unique_per_contact'))
    return new DuplicateContactMethodError();
  if (error.code === '23505' && error.message.includes('contact_methods_value_unique_per_user'))
    return new DuplicateContactAcrossContactsError();
  return new Error(error.message);
}

/** The `p_methods` jsonb element the `*_full` RPCs expect (client-minted `id`, E.164 phone value). */
function methodToJson(method: ContactMethod) {
  return {
    id: method.id,
    method_type: method.methodType,
    value: resolveMethodValue(method),
    label: method.label ?? null,
    is_primary: method.isPrimary,
  };
}

export class ContactsRepositoryImpl implements ContactsRepository {
  async fetchContacts(): Promise<Contact[]> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*, contact_methods(*)')
      .order('first_name', { ascending: true });

    if (error) throw new Error(error.message);

    return (data ?? []).map((row) => contactRowSchema.parse(row));
  }

  /** Re-read the canonical aggregate after a `*_full` write (server `updated_at`, normalized rows). */
  private async fetchOne(id: string): Promise<Contact> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*, contact_methods(*)')
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);

    return contactRowSchema.parse(data);
  }

  async createContactFull(contact: Contact): Promise<Contact> {
    const { error } = await supabase.rpc('create_contact_full', {
      p_id: contact.id,
      p_first_name: contact.firstName,
      p_last_name: contact.lastName ?? null,
      p_display_name: contact.displayName ?? null,
      p_methods: contact.contactMethods.map(methodToJson),
    });

    if (error) throw mapContactWriteError(error);

    return this.fetchOne(contact.id);
  }

  async updateContactFull(contact: Contact): Promise<Contact | null> {
    const { data, error } = await supabase.rpc('update_contact_full', {
      p_id: contact.id,
      p_first_name: contact.firstName,
      p_last_name: contact.lastName ?? null,
      p_display_name: contact.displayName ?? null,
      p_methods: contact.contactMethods.map(methodToJson),
    });

    if (error) throw mapContactWriteError(error);

    // false ⇒ the contact is gone (update-only, never resurrected).
    if (data !== true) return null;

    return this.fetchOne(contact.id);
  }

  async getContactUpdatedAt(id: string): Promise<string | null> {
    // maybeSingle → null (not an error) when the row is gone; RLS scopes to the owner.
    const { data, error } = await supabase
      .from('contacts')
      .select('updated_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return data?.updated_at ?? null;
  }

  async deleteContact(id: string): Promise<void> {
    const { error } = await supabase.from('contacts').delete().eq('id', id);

    if (error) throw new Error(error.message);
  }
}
