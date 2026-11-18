import { create } from 'zustand';

import { sessionUser } from '@/core/auth/session-user';
import { newId } from '@/core/files';
import { createLogger } from '@/core/logging/logger';
import { cachedLoad } from '@/core/offline/cached-load';
import { mutate } from '@/core/offline/mutate';
import { flushThenRefetch, PermanentReplayError, registerReplay } from '@/core/offline/replay';
import type { WriteQueueEntry } from '@/core/offline/write-queue';
import { subscribeRealtime } from '@/core/realtime/subscribe';
import { normalizePhone } from '@/core/utils/phone-normalize';
import { ContactsRepositoryImpl } from '@/features/contacts/data/repositories/contacts-repository-impl';
import type { Contact } from '@/features/contacts/domain/entities/contact';
import type { ContactMethod } from '@/features/contacts/domain/entities/contact-method';
import type { NewContactMethod } from '@/features/contacts/domain/repositories/contact-methods-repository';
import { dedupePhones } from '@/features/contacts/domain/utils/dedupe';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';

/**
 * The user's contacts (contacts), ported from the PWA's store. A contact is one aggregate with its
 * methods: every change builds the whole desired contact and saves it as one idempotent call with
 * client-minted ids, online or replayed from the outbox (contact-methods, "Path Y").
 */
export type PhoneEntry = { value: string; label?: string | null; isPrimary: boolean };

const log = createLogger('ContactsStore');
const repository = new ContactsRepositoryImpl();
const PHONE_LABEL_PRIORITY: Record<string, number> = { Mobile: 1, Home: 2, Work: 3 };

function normalizePhoneValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const result = normalizePhone(trimmed);
  return result.ok ? result.e164 : trimmed;
}

/** An imported contact's primary phone: the best-labelled one (Mobile, Home, Work). */
function resolvePrimaryByLabel(phones: PhoneEntry[]): PhoneEntry[] {
  let best = 0;
  let bestPriority = Number.MAX_SAFE_INTEGER;
  phones.forEach((phone, i) => {
    const priority = phone.label
      ? (PHONE_LABEL_PRIORITY[phone.label] ?? Number.MAX_SAFE_INTEGER)
      : Number.MAX_SAFE_INTEGER;
    if (priority < bestPriority) {
      bestPriority = priority;
      best = i;
    }
  });
  return phones.map((p, i) => ({ ...p, isPrimary: i === best }));
}

const sortByName = (rows: Contact[]) =>
  [...rows].sort((a, b) => a.firstName.localeCompare(b.firstName));
const replaceContact = (rows: Contact[], next: Contact) =>
  sortByName([...rows.filter((c) => c.id !== next.id), next]);

registerReplay('contact', async (entry: WriteQueueEntry) => {
  const { contact } = entry.payload as { contact: Contact };
  if (entry.op === 'delete') {
    await repository.deleteContact(entry.entityId);
    return;
  }
  if (entry.op === 'create') {
    await repository.createContactFull(contact);
    return;
  }
  const serverTs = await repository.getContactUpdatedAt(entry.entityId);
  if (serverTs === null) throw new PermanentReplayError('contact was deleted on the server');
  if (entry.baseUpdatedAt && new Date(serverTs) > new Date(entry.baseUpdatedAt)) {
    throw new PermanentReplayError('contact changed on the server since this edit (LWW loser)');
  }
  if ((await repository.updateContactFull(contact)) === null) {
    throw new PermanentReplayError('contact was deleted on the server');
  }
});

type ContactsState = {
  contacts: Contact[];
  isLoading: boolean;
  /** True once the first load settled (success or failure): the gate name resolution waits for. */
  hasLoaded: boolean;
  error: string | null;
  start: () => void;
  clear: () => void;
  loadContacts: () => Promise<void>;
  addContact: (
    firstName: string,
    lastName?: string | null,
    displayName?: string | null,
    phones?: PhoneEntry[],
    source?: 'manual' | 'import',
  ) => Promise<Contact | undefined>;
  /** Saves a whole contact built by the form (fields and methods together). */
  saveContact: (contact: Contact) => Promise<unknown>;
  updateContact: (
    id: string,
    data: Partial<Pick<Contact, 'firstName' | 'lastName' | 'displayName'>>,
  ) => Promise<unknown>;
  deleteContact: (id: string) => Promise<unknown>;
  addMethodToContact: (contactId: string, method: NewContactMethod) => Promise<unknown>;
  updateMethodOnContact: (
    contactId: string,
    methodId: string,
    data: Partial<Omit<ContactMethod, 'id' | 'contactId'>>,
  ) => Promise<unknown>;
  setPrimaryPhoneOnContact: (contactId: string, methodId: string) => Promise<unknown>;
  removeMethodFromContact: (contactId: string, methodId: string) => Promise<unknown>;
  findContactByMethodValue: (
    methodType: 'phone' | 'email',
    value: string,
    exceptContactId?: string,
  ) => Contact | undefined;
  relationshipsForContact: (
    contactId: string,
  ) => Promise<{ hasPending: boolean; hasFriendship: boolean }>;
  relationshipsForPhone: (
    phone: string,
  ) => Promise<{ hasPending: boolean; hasFriendship: boolean; userId: string | null }>;
};

let unsubscribe: (() => void) | null = null;
const uid = () => sessionUser.getState().id;
const cacheKey = () => `contacts:${uid()}`;

export const useContactsStore = create<ContactsState>()((set, get) => {
  const assign = (contacts: Contact[]) => set({ contacts });

  const create = (contact: Contact) =>
    mutate<Contact>({
      run: async () => {
        const created = await repository.createContactFull(contact);
        assign(replaceContact(get().contacts, created));
      },
      intent: { entityId: contact.id, kind: 'contact', op: 'create', payload: { contact } },
      cacheKey: cacheKey(),
      current: get().contacts,
      apply: (rows) => replaceContact(rows, contact),
      assign,
    });

  /** The single update seam: every field or method change routes here as the whole aggregate. */
  const update = (contact: Contact) => {
    const existing = get().contacts.find((c) => c.id === contact.id) ?? null;
    return mutate<Contact>({
      run: async () => {
        const updated = await repository.updateContactFull(contact);
        if (updated === null) throw new Error('Contact no longer exists');
        assign(replaceContact(get().contacts, updated));
      },
      intent: {
        entityId: contact.id,
        kind: 'contact',
        op: 'update',
        payload: { contact },
        baseSnapshot: existing,
        baseUpdatedAt: existing?.updatedAt ?? undefined,
      },
      cacheKey: cacheKey(),
      current: get().contacts,
      apply: (rows) => replaceContact(rows, contact),
      assign,
    });
  };

  return {
    contacts: [],
    isLoading: false,
    hasLoaded: false,
    error: null,

    start: () => {
      const me = uid();
      if (!me || unsubscribe) return;
      unsubscribe = subscribeRealtime({
        topic: `contacts:${me}`,
        postgres: [
          { event: '*', table: 'contacts', filter: `user_id=eq.${me}` },
          { event: '*', table: 'contact_methods', filter: `user_id=eq.${me}` },
        ],
        onChange: () => void get().loadContacts(),
        onSubscribed: () => void flushThenRefetch(get().loadContacts),
      });
      void get().loadContacts();
    },

    clear: () => {
      unsubscribe?.();
      unsubscribe = null;
      set({ contacts: [], error: null, hasLoaded: false, isLoading: false });
    },

    loadContacts: async () => {
      const me = uid();
      if (!me) return;
      set({ isLoading: true, error: null });
      try {
        await cachedLoad(
          `contacts:${me}`,
          () => repository.fetchContacts(),
          (result) => {
            if (uid() === me) assign(result);
          },
        );
      } catch (error) {
        set({ error: error instanceof Error ? error.message : 'Failed to load contacts' });
        log.error('Failed to load contacts', error);
      } finally {
        set({ isLoading: false, hasLoaded: true });
      }
    },

    addContact: async (firstName, lastName, displayName, phones, source = 'manual') => {
      const me = uid();
      if (!me) return undefined;
      let list = dedupePhones(phones ?? []);
      if (list.length > 1) {
        if (source === 'import') list = resolvePrimaryByLabel(list);
        else if (list.filter((p) => p.isPrimary).length !== 1) {
          throw new Error(
            'Exactly one phone must be marked as primary when adding multiple phones',
          );
        }
      }
      const prepared = list
        .map((phone) => {
          const value = normalizePhoneValue(phone.value);
          return value ? { value, label: phone.label ?? null, isPrimary: phone.isPrimary } : null;
        })
        .filter(
          (p): p is { value: string; label: string | null; isPrimary: boolean } => p !== null,
        );
      if (prepared.length === 1) prepared[0]!.isPrimary = true;
      const contactId = newId();
      const contact: Contact = {
        id: contactId,
        userId: me,
        firstName: firstName.trim(),
        lastName: lastName?.trim() || null,
        displayName: displayName?.trim() || null,
        contactMethods: prepared.map((phone) => ({
          id: newId(),
          contactId,
          methodType: 'phone',
          value: phone.value,
          label: phone.label,
          isPrimary: phone.isPrimary,
          isValid: true,
        })),
        updatedAt: null,
      };
      await create(contact);
      return contact;
    },

    saveContact: (contact) =>
      get().contacts.some((c) => c.id === contact.id) ? update(contact) : create(contact),

    updateContact: async (id, data) => {
      const contact = get().contacts.find((c) => c.id === id);
      if (!contact) return;
      return update({
        ...contact,
        firstName: data.firstName ?? contact.firstName,
        lastName: data.lastName !== undefined ? data.lastName : contact.lastName,
        displayName: data.displayName !== undefined ? data.displayName : contact.displayName,
      });
    },

    deleteContact: async (id) => {
      const existing = get().contacts.find((c) => c.id === id) ?? null;
      const outcome = await mutate<Contact>({
        run: async () => {
          await repository.deleteContact(id);
          assign(get().contacts.filter((c) => c.id !== id));
        },
        intent: {
          entityId: id,
          kind: 'contact',
          op: 'delete',
          payload: {},
          baseSnapshot: existing,
        },
        cacheKey: cacheKey(),
        current: get().contacts,
        apply: (rows) => rows.filter((c) => c.id !== id),
        assign,
      });
      // Tours drop the contact from their partners (the server did the same).
      const { useToursStore } =
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: the tours store imports this one
        require('@/features/tours/presentation/stores/tours-store') as typeof import('@/features/tours/presentation/stores/tours-store');
      useToursStore.getState().dropPartner(id);
      return outcome;
    },

    addMethodToContact: async (contactId, method) => {
      const contact = get().contacts.find((c) => c.id === contactId);
      if (!contact) return;
      const isPhone = method.methodType === 'phone';
      const value = isPhone ? normalizePhoneValue(method.value) || method.value : method.value;
      const phones = contact.contactMethods.filter((m) => m.methodType === 'phone');
      // The first phone is primary; an explicitly primary new one demotes the others.
      const makePrimary = isPhone && (phones.length === 0 || method.isPrimary === true);
      const base =
        makePrimary && isPhone
          ? contact.contactMethods.map((m) =>
              m.methodType === 'phone' ? { ...m, isPrimary: false } : m,
            )
          : contact.contactMethods;
      return update({
        ...contact,
        contactMethods: [
          ...base,
          {
            id: newId(),
            contactId,
            methodType: method.methodType,
            value,
            label: method.label ?? null,
            isPrimary: makePrimary,
            isValid: true,
          },
        ],
      });
    },

    updateMethodOnContact: async (contactId, methodId, data) => {
      const contact = get().contacts.find((c) => c.id === contactId);
      const method = contact?.contactMethods.find((m) => m.id === methodId);
      if (!contact || !method) return;
      const isPhone = method.methodType === 'phone';
      const nextValue =
        data.value !== undefined
          ? isPhone
            ? normalizePhoneValue(data.value) || data.value
            : data.value
          : method.value;
      const promote = isPhone && data.isPrimary === true && !method.isPrimary;
      return update({
        ...contact,
        contactMethods: contact.contactMethods.map((m) =>
          m.id === methodId
            ? {
                ...m,
                value: nextValue,
                label: data.label !== undefined ? data.label : m.label,
                isPrimary: promote ? true : (data.isPrimary ?? m.isPrimary),
                isValid: true,
              }
            : promote && m.methodType === 'phone'
              ? { ...m, isPrimary: false }
              : m,
        ),
      });
    },

    setPrimaryPhoneOnContact: async (contactId, methodId) => {
      const contact = get().contacts.find((c) => c.id === contactId);
      if (!contact) return;
      const target = contact.contactMethods.find((m) => m.id === methodId);
      if (target?.methodType !== 'phone')
        throw new Error('method not found or is not a phone method');
      return update({
        ...contact,
        contactMethods: contact.contactMethods.map((m) =>
          m.methodType === 'phone' ? { ...m, isPrimary: m.id === methodId } : m,
        ),
      });
    },

    removeMethodFromContact: async (contactId, methodId) => {
      const contact = get().contacts.find((c) => c.id === contactId);
      if (!contact) return;
      const removing = contact.contactMethods.find((m) => m.id === methodId);
      let methods = contact.contactMethods.filter((m) => m.id !== methodId);
      // Removing the primary phone promotes the next one.
      if (removing?.methodType === 'phone' && removing.isPrimary) {
        const next = methods.findIndex((m) => m.methodType === 'phone');
        if (next >= 0)
          methods = methods.map((m, i) => (i === next ? { ...m, isPrimary: true } : m));
      }
      return update({ ...contact, contactMethods: methods });
    },

    findContactByMethodValue: (methodType, value, exceptContactId) => {
      const normalized = methodType === 'phone' ? normalizePhoneValue(value) || value : value;
      // Both sides normalized: a contact imported with a local-format phone still matches.
      return get().contacts.find(
        (c) =>
          c.id !== exceptContactId &&
          c.contactMethods.some(
            (m) =>
              m.methodType === methodType &&
              (methodType === 'phone' ? normalizePhoneValue(m.value) || m.value : m.value) ===
                normalized,
          ),
      );
    },

    relationshipsForContact: async (contactId) => {
      const contact = get().contacts.find((c) => c.id === contactId);
      const phones =
        contact?.contactMethods.filter((m) => m.methodType === 'phone').map((m) => m.value) ?? [];
      if (phones.length === 0) return { hasPending: false, hasFriendship: false };
      const friendships = useFriendshipsStore.getState();
      const results = await friendships.findUsersByPhones(phones);
      const now = useFriendshipsStore.getState();
      return {
        hasPending: results.some((r) => now.pendingRequestUserIds.has(r.userId)),
        hasFriendship: results.some((r) => now.friendUserIds.has(r.userId)),
      };
    },

    relationshipsForPhone: async (phone) => {
      const userId = await useFriendshipsStore.getState().findUserByPhone(phone);
      if (!userId) return { hasPending: false, hasFriendship: false, userId: null };
      const now = useFriendshipsStore.getState();
      return {
        hasPending: now.pendingRequestUserIds.has(userId),
        hasFriendship: now.friendUserIds.has(userId),
        userId,
      };
    },
  };
});
