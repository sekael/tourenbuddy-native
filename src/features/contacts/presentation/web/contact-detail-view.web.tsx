import { useEffect, useImperativeHandle, useRef, type CSSProperties, type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { DuplicateContactAcrossContactsError } from '@/core/exceptions';
import { normalizePhone } from '@/core/utils/phone-normalize';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { BaseTooltip } from '@/core/web/base-tooltip.web';
import { classes } from '@/core/web/classes';
import { useAsYouTypePhone } from '@/core/web/use-as-you-type-phone.web';
import { useFlipMove } from '@/core/web/use-flip-move.web';
import { useReactive } from '@/core/web/use-reactive.web';
import {
  formatPhoneDisplay,
  resolveContactName,
  type Contact,
} from '@/features/contacts/domain/entities/contact';
import type { ContactMethod } from '@/features/contacts/domain/entities/contact-method';
import type { NewContactMethod } from '@/features/contacts/domain/repositories/contact-methods-repository';
import { buildContactActions } from '@/features/contacts/domain/utils/contact-actions';
import { orderedPhoneMethods } from '@/features/contacts/domain/utils/order-phone-methods';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';

import styles from './contact-detail-view.module.css';
import { useContactBlocked } from './use-contact-blocked.web';
import {
  PRIMARY_FADE_MS,
  PRIMARY_MOVE_MS,
  usePrimarySwitchSequence,
} from './use-primary-switch-sequence.web';

const c = classes(styles);

export type DetailMode = 'view' | 'edit';

export type ContactDetailHandle = {
  enterEditMode: () => void;
  saveAll: () => Promise<boolean>;
  cancelEdit: () => void;
  /** Saves pending edits (edit mode only); throws when they could not be saved. */
  commitPendingEdits: () => Promise<void>;
};

type MethodEdit = { value: string; label: string; saving: boolean; error: string | null };
type Relationship = { hasFriendship: boolean; hasPending: boolean };
type Conflict = Contact | 'generic';

const methodDisplayValue = (m: ContactMethod) =>
  m.methodType === 'phone' ? formatPhoneDisplay(m.value) : m.value;
const freshEdit = (m: ContactMethod): MethodEdit => ({
  value: methodDisplayValue(m),
  label: m.label ?? '',
  saving: false,
  error: null,
});

/** A phone input formatted as you type (one hook per row). */
function PhoneField({
  value,
  className,
  placeholder,
  onChange,
}: {
  value: string;
  className: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const phone = useAsYouTypePhone(value, onChange);
  return (
    <input
      value={phone.formatted}
      className={className}
      type="tel"
      placeholder={placeholder}
      onChange={phone.onInput}
    />
  );
}

/**
 * One contact (`contact-detail-view.vue`): who it is and how to reach them; in edit mode its names
 * and methods, each saved with the guards the PWA has (duplicates across contacts, a phone that
 * links a friend or a pending request).
 */
export function ContactDetailView({
  contact,
  linkedFriendUserId,
  embedded,
  mode,
  ref,
  onModeChange,
  onSavingChange,
  onEditContact,
  onShowTours,
}: {
  contact: Contact;
  linkedFriendUserId?: string | null;
  /** Inside a full-screen page: the page's top bar supplies Save/Cancel. */
  embedded?: boolean;
  /** Owned by the parent so it survives the sheet → full-screen page swap. */
  mode: DetailMode;
  ref?: Ref<ContactDetailHandle>;
  onModeChange: (mode: DetailMode) => void;
  onSavingChange?: (saving: boolean) => void;
  onEditContact: (contact: Contact) => void;
  onShowTours: (userId: string) => void;
}) {
  'use no memo';
  const { t } = useTranslation('web');
  const tk = t as unknown as (key: string, params?: Record<string, unknown>) => string;
  const store = useContactsStore.getState();
  const friendships = useFriendshipsStore.getState();
  const userIdToPhoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  /** The contact as the store holds it now (fresh after an await). */
  const live = () =>
    useContactsStore.getState().contacts.find((x) => x.id === contact.id) ?? contact;

  const isContactBlocked = useContactBlocked(contact, linkedFriendUserId);
  const isFriend = !!linkedFriendUserId && !isContactBlocked;

  // ── Hero: the overlay title shows the resolved name; the full name only when a display name hides it.
  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  const heroSubtitle = contact.displayName && contact.displayName !== fullName ? fullName : null;
  const reach = buildContactActions(contact)[0] ?? null;
  const hasIdentity = !!heroSubtitle || isContactBlocked || isFriend;
  const hasQuickActions = isFriend || !!reach;

  const s = useReactive(() => ({
    pendingPrimaryId: null as string | null,
    setPrimaryError: null as string | null,
    isSaving: false,
    saveError: null as string | null,
    firstName: contact.firstName,
    lastName: contact.lastName ?? '',
    displayName: contact.displayName ?? '',
    nameError: null as string | null,
    methodEdits: {} as Record<string, MethodEdit>,
    methodEvictConfirm: null as ({ methodId: string; linkedUserId: string } & Relationship) | null,
    methodEditDuplicate: null as { methodId: string; contact: Conflict } | null,
    methodDeleteConfirm: null as
      ({ methodId: string; linkedUserId: string | null } & Relationship) | null,
    isRemovingMethod: false,
    removeMethodError: null as string | null,
    showAddMethod: false,
    newMethodType: 'phone' as 'phone' | 'email',
    newMethodValue: '',
    newMethodLabel: '',
    isAddingMethod: false,
    addMethodError: null as string | null,
    addMethodDuplicateConflict: null as Conflict | null,
  }));
  const evictResolve = useRef<((confirmed: boolean) => void) | null>(null);

  const setMode = (next: DetailMode) => onModeChange(next);
  const setSaving = (saving: boolean) => {
    s.isSaving = saving;
    onSavingChange?.(saving);
  };

  // ── Staged primary switch: the clicked phone is the target at once and stays it until the store
  // catches up; a failed save drops it, so the same sequence plays back to the old primary.
  const storePrimaryId =
    contact.contactMethods.find((m) => m.methodType === 'phone' && m.isPrimary)?.id ?? null;
  useEffect(() => {
    if (storePrimaryId === s.pendingPrimaryId) s.pendingPrimaryId = null;
  }, [storePrimaryId]);
  const { orderId: primaryOrderId, highlightId: primaryHighlightId } = usePrimarySwitchSequence(
    s.pendingPrimaryId ?? storePrimaryId,
  );
  const orderedPhones = orderedPhoneMethods(contact, primaryOrderId);
  const isShownPrimary = (m: ContactMethod) => m.id === primaryHighlightId;
  const phonesRef = useFlipMove<HTMLDivElement>(
    orderedPhones.map((m) => m.id),
    c('phone-move'),
  );

  const friendPhone = linkedFriendUserId ? userIdToPhoneMap.get(linkedFriendUserId) : undefined;
  const linkedMethodIds = new Set(
    friendPhone
      ? contact.contactMethods
          .filter((m) => {
            if (m.methodType !== 'phone') return false;
            const norm = normalizePhone(m.value);
            return (norm.ok ? norm.e164 : m.value) === friendPhone;
          })
          .map((m) => m.id)
      : [],
  );

  // Names follow the store while reading; edits keep what the user typed.
  useEffect(() => {
    if (mode !== 'view') return;
    s.firstName = contact.firstName;
    s.lastName = contact.lastName ?? '';
    s.displayName = contact.displayName ?? '';
  }, [contact]);
  // Every method gets its edit state once.
  useEffect(() => {
    const missing = contact.contactMethods.filter((m) => !s.methodEdits[m.id]);
    if (missing.length)
      s.methodEdits = {
        ...s.methodEdits,
        ...Object.fromEntries(missing.map((m) => [m.id, freshEdit(m)])),
      };
  }, [contact.contactMethods]);

  const editOf = (m: ContactMethod) => s.methodEdits[m.id] ?? freshEdit(m);
  const patchEdit = (m: ContactMethod, patch: Partial<MethodEdit>) =>
    (s.methodEdits = { ...s.methodEdits, [m.id]: { ...editOf(m), ...patch } });
  function resetMethodEdit(methodId: string) {
    const original = live().contactMethods.find((m) => m.id === methodId);
    if (original) s.methodEdits = { ...s.methodEdits, [methodId]: freshEdit(original) };
  }

  function enterEditMode() {
    s.saveError = null;
    setMode('edit');
  }

  async function saveNameInternal() {
    s.nameError = null;
    if (!s.firstName.trim()) {
      s.nameError = t('contacts.detailView.firstNameRequired');
      throw new Error(s.nameError);
    }
    try {
      await store.updateContact(contact.id, {
        firstName: s.firstName.trim(),
        lastName: s.lastName.trim() || null,
        displayName: s.displayName.trim() || null,
      });
    } catch (err) {
      s.nameError = err instanceof Error ? err.message : 'Failed to save';
      throw err;
    }
  }

  // ── Edit-evict: editing a phone whose OLD value links a friend or a pending request.
  function waitForEvictConfirm(confirm: NonNullable<typeof s.methodEvictConfirm>) {
    s.methodEvictConfirm = confirm;
    return new Promise<boolean>((resolve) => (evictResolve.current = resolve));
  }
  function settleEvict(confirmed: boolean) {
    if (!confirmed && s.methodEvictConfirm) resetMethodEdit(s.methodEvictConfirm.methodId);
    s.methodEvictConfirm = null;
    evictResolve.current?.(confirmed);
    evictResolve.current = null;
  }

  function editConflict(conflict: Conflict | null, clear: () => void) {
    if (!conflict || conflict === 'generic') return;
    clear();
    onEditContact(conflict);
  }

  /**
   * False when the edit was blocked or the user backed out of the evict confirmation: saveAll stops
   * there and stays in edit mode rather than persisting the other fields of the same attempt.
   */
  async function saveMethod(method: ContactMethod): Promise<boolean> {
    patchEdit(method, { error: null });
    s.methodEditDuplicate = null;
    let evictFriendUserId: string | null = null;
    const edit = editOf(method);
    let newValue = edit.value.trim();
    if (method.methodType === 'phone' && newValue) {
      const result = normalizePhone(newValue);
      if (!result.ok) {
        patchEdit(method, { error: t('contacts.detailView.invalidPhone') });
        return false;
      }
      newValue = result.e164;
    }
    if (method.methodType === 'phone' && newValue !== method.value) {
      const conflict = store.findContactByMethodValue('phone', newValue, contact.id);
      if (conflict) {
        s.methodEditDuplicate = { methodId: method.id, contact: conflict };
        return false;
      }
      const rel = await store.relationshipsForPhone(method.value);
      if (rel.hasFriendship || rel.hasPending) {
        const confirmed = await waitForEvictConfirm({
          methodId: method.id,
          linkedUserId: rel.userId!,
          hasFriendship: rel.hasFriendship,
          hasPending: rel.hasPending,
        });
        if (!confirmed) return false;
        if (rel.hasFriendship) evictFriendUserId = rel.userId;
      }
    }
    patchEdit(method, { saving: true });
    try {
      await store.updateMethodOnContact(contact.id, method.id, {
        value: newValue || editOf(method).value.trim(),
        label: editOf(method).label.trim() || null,
      });
      if (evictFriendUserId) await friendships.removeFriendship(evictFriendUserId);
      const updated = live().contactMethods.find((m) => m.id === method.id);
      if (updated) patchEdit(method, { value: methodDisplayValue(updated) });
      return true;
    } catch (err) {
      if (err instanceof DuplicateContactAcrossContactsError)
        s.methodEditDuplicate = { methodId: method.id, contact: 'generic' };
      else patchEdit(method, { error: err instanceof Error ? err.message : 'Failed to save' });
      return false;
    } finally {
      patchEdit(method, { saving: false });
    }
  }

  async function executeRemoveMethod(methodId: string) {
    await store.removeMethodFromContact(contact.id, methodId);
    const { [methodId]: _removed, ...rest } = s.methodEdits;
    s.methodEdits = rest;
  }

  async function requestRemoveMethod(method: ContactMethod) {
    s.removeMethodError = null;
    if (method.methodType !== 'phone') {
      void executeRemoveMethod(method.id);
      return;
    }
    const rel = await store.relationshipsForPhone(method.value);
    const linked = linkedMethodIds.has(method.id);
    if (!rel.hasPending && !rel.hasFriendship && !linked) {
      void executeRemoveMethod(method.id);
      return;
    }
    s.methodDeleteConfirm = {
      methodId: method.id,
      linkedUserId: rel.userId ?? (linked ? (linkedFriendUserId ?? null) : null),
      hasPending: rel.hasPending,
      hasFriendship: rel.hasFriendship || linked,
    };
  }

  async function confirmRemoveMethod() {
    const pending = s.methodDeleteConfirm;
    if (!pending) return;
    s.isRemovingMethod = true;
    s.removeMethodError = null;
    try {
      if (pending.hasFriendship && pending.linkedUserId)
        await friendships.removeFriendship(pending.linkedUserId);
      await executeRemoveMethod(pending.methodId);
      s.methodDeleteConfirm = null;
    } catch (err) {
      s.removeMethodError = err instanceof Error ? err.message : 'Failed to remove';
    } finally {
      s.isRemovingMethod = false;
    }
  }

  async function setPrimaryPhone(method: ContactMethod) {
    if (method.isPrimary || s.pendingPrimaryId) return;
    s.setPrimaryError = null;
    s.pendingPrimaryId = method.id;
    try {
      await store.setPrimaryPhoneOnContact(contact.id, method.id);
    } catch (err) {
      s.pendingPrimaryId = null;
      s.setPrimaryError = err instanceof Error ? err.message : 'Failed to update primary phone';
    }
  }

  // ── Add method
  function openAddMethod() {
    s.showAddMethod = true;
    s.newMethodType = 'phone';
    s.newMethodValue = '';
    s.newMethodLabel = '';
    s.addMethodError = null;
    s.addMethodDuplicateConflict = null;
  }

  async function confirmAddMethod() {
    s.addMethodError = null;
    s.addMethodDuplicateConflict = null;
    if (!s.newMethodValue.trim()) {
      s.addMethodError = t('contacts.detailView.valueRequired');
      return;
    }
    let value = s.newMethodValue.trim();
    if (s.newMethodType === 'phone') {
      const result = normalizePhone(value);
      if (!result.ok) {
        s.addMethodError = t('contacts.detailView.invalidPhone');
        return;
      }
      value = result.e164;
    }
    const conflict = store.findContactByMethodValue(s.newMethodType, value, contact.id);
    if (conflict) {
      s.addMethodDuplicateConflict = conflict;
      return;
    }
    s.isAddingMethod = true;
    try {
      const method: NewContactMethod = {
        methodType: s.newMethodType,
        value,
        label: s.newMethodLabel.trim() || null,
        isPrimary: !live().contactMethods.some((m) => m.methodType === s.newMethodType),
      };
      await store.addMethodToContact(contact.id, method);
      s.showAddMethod = false;
    } catch (err) {
      if (err instanceof DuplicateContactAcrossContactsError)
        s.addMethodDuplicateConflict = 'generic';
      else
        s.addMethodError = err instanceof Error ? err.message : t('contacts.detailView.addError');
    } finally {
      s.isAddingMethod = false;
    }
  }

  const validPhone = (v: string) => normalizePhone(v).ok;
  const canSave =
    !!s.firstName.trim() &&
    contact.contactMethods.every((m) => {
      const value = editOf(m).value;
      return !!value.trim() && (m.methodType !== 'phone' || validPhone(value));
    }) &&
    (!s.showAddMethod ||
      (!!s.newMethodValue.trim() && (s.newMethodType !== 'phone' || validPhone(s.newMethodValue))));

  function cancelEdit() {
    s.firstName = contact.firstName;
    s.lastName = contact.lastName ?? '';
    s.displayName = contact.displayName ?? '';
    s.nameError = null;
    s.methodEdits = Object.fromEntries(contact.contactMethods.map((m) => [m.id, freshEdit(m)]));
    s.showAddMethod = false;
    s.newMethodValue = '';
    s.newMethodLabel = '';
    s.addMethodError = null;
    s.saveError = null;
    setMode('view');
  }

  async function saveAll(): Promise<boolean> {
    setSaving(true);
    s.saveError = null;
    try {
      for (const method of live().contactMethods) {
        if (!(await saveMethod(method))) return false;
      }
      if (s.showAddMethod && s.newMethodValue.trim()) await confirmAddMethod();
      await saveNameInternal();
      const hasMethodError = Object.values(s.methodEdits).some((e) => e.error);
      if (hasMethodError || (s.showAddMethod && s.addMethodError)) {
        s.saveError = t('contacts.detailView.saveFailed');
        return false;
      }
      setMode('view');
      return true;
    } catch (err) {
      s.saveError = err instanceof Error ? err.message : t('contacts.detailView.saveFailed');
      return false;
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({
    enterEditMode,
    saveAll,
    cancelEdit,
    commitPendingEdits: async () => {
      if (mode === 'view') return;
      if (!(await saveAll())) throw new Error(s.saveError ?? t('contacts.detailView.saveFailed'));
    },
  }));

  const warning = (key: string) => (
    <p className={c('delete-friend-warning')}>
      <BaseIcon name="warning" className={c('warn-icon')} />
      {tk(key)}
    </p>
  );
  const relationWarning = (r: Relationship, prefix: string) =>
    r.hasFriendship && r.hasPending
      ? warning(`contacts.detailView.${prefix}FriendAndPendingWarning`)
      : r.hasFriendship
        ? warning(`contacts.detailView.${prefix}FriendWarning`)
        : r.hasPending
          ? warning(`contacts.detailView.${prefix}PendingWarning`)
          : null;
  const duplicateDisclaimer = (conflict: Conflict, onDiscard: () => void, onEdit: () => void) => (
    <div className={c('duplicate-disclaimer')}>
      <p className={c('duplicate-title')}>
        <BaseIcon name="warning" className={c('warn-icon')} />
        {t('contacts.shared.duplicateTitle')}
      </p>
      <p className={c('duplicate-text')}>
        {conflict === 'generic'
          ? t('contacts.shared.duplicateGenericText')
          : t('contacts.shared.duplicateText', { name: resolveContactName(conflict) })}
      </p>
      <div className={c('duplicate-actions')}>
        <BaseButton type="button" variant="secondary" size="sm" onClick={onDiscard}>
          {t('contacts.shared.discardBtn')}
        </BaseButton>
        {conflict !== 'generic' && (
          <BaseButton type="button" variant="primary" size="sm" onClick={onEdit}>
            {t('contacts.shared.editExistingBtn')}
          </BaseButton>
        )}
      </div>
    </div>
  );
  const nameField = (
    id: string,
    label: string,
    placeholder: string,
    key: 'firstName' | 'lastName' | 'displayName',
    required = false,
  ) => (
    <div className={c('field')}>
      <label className={c('label')} htmlFor={id}>
        {label}
        {required && <span className={c('required')}>*</span>}
      </label>
      <input
        id={id}
        value={s[key]}
        className={c('input')}
        type="text"
        maxLength={50}
        placeholder={placeholder}
        onChange={(e) => (s[key] = e.target.value)}
      />
    </div>
  );
  const methodEditFields = (method: ContactMethod, input: React.ReactNode) => (
    <div className={c('method-fields')}>
      {method.methodType === 'phone' && !method.isValid && (
        <p className={c('invalid-phone-hint')}>
          <BaseIcon name="warning" className={c('warn-icon')} />
          {t('contacts.detailView.invalidPhoneHint')}
        </p>
      )}
      {input}
      <input
        value={editOf(method).label}
        className={c('input input-sm')}
        type="text"
        placeholder={t('contacts.detailView.labelPlaceholder')}
        onChange={(e) => patchEdit(method, { label: e.target.value })}
      />
      {editOf(method).error && <p className={c('error-text')}>{editOf(method).error}</p>}
    </div>
  );
  const viewFields = (value: string, label: string | null) => (
    <div className={c('method-fields method-fields--view')}>
      <span className={c('view-value')}>{value}</span>
      {label && <span className={c('view-label-sm')}>{label}</span>}
    </div>
  );

  return (
    <div className={c('detail-view')}>
      {/* View mode: who it is, then the ways to reach them. The overlay title holds the name. */}
      {mode === 'view' && (hasIdentity || hasQuickActions) && (
        <section className={c('hero')}>
          {hasIdentity && (
            <div className={c('hero-identity')}>
              {heroSubtitle && (
                <span className={c('hero-subtitle')} data-testid="hero-subtitle">
                  {heroSubtitle}
                </span>
              )}
              {isContactBlocked ? (
                <span className={c('hero-status hero-status--blocked')} data-testid="hero-status">
                  <BaseIcon name="block" size="sm" />
                  {t('blocks.tooltip')}
                </span>
              ) : isFriend ? (
                <span className={c('hero-status hero-status--friend')} data-testid="hero-status">
                  <BaseIcon name="group" size="sm" />
                  {t('friendships.tooltip')}
                </span>
              ) : null}
            </div>
          )}
          {hasQuickActions && (
            <div className={c('quick-actions')} data-testid="quick-actions">
              {/* A friend's tours, one tap from their contact (#362). */}
              {isFriend && (
                <button
                  type="button"
                  className={c('quick-action')}
                  data-testid="show-friend-tours"
                  onClick={() => onShowTours(linkedFriendUserId!)}
                >
                  <BaseIcon name="route" />
                  {t('contacts.detailView.showToursBtn')}
                </button>
              )}
              {reach && (
                <>
                  <a href={reach.call} className={c('quick-action')} data-testid="call-action">
                    <BaseIcon name="call" />
                    {t('contacts.detailView.callAction')}
                  </a>
                  <a
                    href={reach.whatsApp}
                    className={c('quick-action')}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="whatsapp-action"
                  >
                    <BaseIcon name="chat" />
                    {t('contacts.detailView.whatsAppAction')}
                  </a>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {mode === 'edit' && (
        <section className={c('section')}>
          <h3 className={c('section-label')}>{t('contacts.detailView.nameSection')}</h3>
          {nameField(
            'dv-firstName',
            t('contacts.form.firstNameLabel'),
            t('contacts.form.firstNamePlaceholder'),
            'firstName',
            true,
          )}
          {nameField(
            'dv-lastName',
            t('contacts.form.lastNameLabel'),
            t('contacts.form.lastNamePlaceholder'),
            'lastName',
          )}
          {nameField(
            'dv-displayName',
            t('contacts.form.displayNameLabel'),
            t('contacts.form.displayNamePlaceholder'),
            'displayName',
          )}
          {s.nameError && <p className={c('error-text')}>{s.nameError}</p>}
        </section>
      )}

      <section className={c('section')}>
        <h3 className={c('section-label')}>{t('contacts.detailView.methodsSection')}</h3>
        {contact.contactMethods.length === 0 && (
          <div className={c('empty-methods')}>{t('contacts.detailView.noMethods')}</div>
        )}
        {s.setPrimaryError && <p className={c('error-text')}>{s.setPrimaryError}</p>}
        {s.removeMethodError && <p className={c('error-text')}>{s.removeMethodError}</p>}

        {/* Phones, primary first; a promoted phone travels to the top (slow FLIP move). */}
        <div
          ref={phonesRef}
          className={c('phone-methods')}
          style={
            {
              '--phone-fade': `${PRIMARY_FADE_MS}ms`,
              '--phone-move': `${PRIMARY_MOVE_MS}ms`,
            } as CSSProperties
          }
        >
          {orderedPhones.map((method) => (
            <div key={method.id} data-flip-key={method.id} className={c('phone-method')}>
              <div
                className={c('method-row', {
                  'method-row--primary': isShownPrimary(method) && orderedPhones.length > 1,
                })}
              >
                {/* Primary star: only a non-primary phone in edit mode is a button. */}
                {mode === 'edit' && !isShownPrimary(method) ? (
                  <button
                    type="button"
                    className={c('primary-star')}
                    onClick={() => void setPrimaryPhone(method)}
                  >
                    <BaseTooltip text={t('contacts.detailView.setAsPrimaryTooltip')}>
                      <BaseIcon name="star" />
                    </BaseTooltip>
                  </button>
                ) : mode === 'edit' || orderedPhones.length > 1 ? (
                  // A lone phone needs no star while reading.
                  <span
                    className={c('primary-star', {
                      'primary-star--selected': isShownPrimary(method),
                    })}
                  >
                    {isShownPrimary(method) ? (
                      <BaseTooltip text={t('contacts.detailView.primaryPhoneTooltip')}>
                        <BaseIcon name="star_filled" />
                      </BaseTooltip>
                    ) : (
                      <BaseIcon name="star" />
                    )}
                  </span>
                ) : null}
                <div className={c('method-type-badge')}>
                  <BaseIcon name="phone" />
                </div>
                {mode === 'view'
                  ? viewFields(methodDisplayValue(method), method.label)
                  : methodEditFields(
                      method,
                      <PhoneField
                        value={editOf(method).value}
                        className={c('input input-sm', { 'input--warning': !method.isValid })}
                        placeholder={t('contacts.detailView.phonePlaceholder')}
                        onChange={(value) => patchEdit(method, { value })}
                      />,
                    )}
                {mode === 'edit' && (
                  <div className={c('method-actions')}>
                    <BaseIconButton
                      name="delete"
                      label={t('contacts.detailView.removeBtn')}
                      size="sm"
                      tone="danger"
                      data-testid="remove-method-btn"
                      disabled={s.methodDeleteConfirm?.methodId === method.id}
                      onClick={() => void requestRemoveMethod(method)}
                    />
                  </div>
                )}
              </div>

              {s.methodDeleteConfirm?.methodId === method.id && (
                <div className={c('method-delete-confirm')}>
                  <p className={c('delete-confirm-text')}>
                    {t('contacts.detailView.removeMethodConfirm')}
                  </p>
                  {relationWarning(s.methodDeleteConfirm, 'removeMethod')}
                  <div className={c('delete-actions')}>
                    <BaseButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={s.isRemovingMethod}
                      onClick={() => (s.methodDeleteConfirm = null)}
                    >
                      {t('contacts.detailView.cancelBtn')}
                    </BaseButton>
                    <BaseButton
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={s.isRemovingMethod}
                      onClick={() => void confirmRemoveMethod()}
                    >
                      {s.isRemovingMethod
                        ? t('contacts.detailView.removingMethodBtn')
                        : t('contacts.detailView.removeBtn')}
                    </BaseButton>
                  </div>
                </div>
              )}

              {s.methodEditDuplicate?.methodId === method.id &&
                duplicateDisclaimer(
                  s.methodEditDuplicate.contact,
                  () => {
                    resetMethodEdit(method.id);
                    s.methodEditDuplicate = null;
                  },
                  () =>
                    editConflict(
                      s.methodEditDuplicate?.contact ?? null,
                      () => (s.methodEditDuplicate = null),
                    ),
                )}

              {s.methodEvictConfirm?.methodId === method.id && (
                <div className={c('method-delete-confirm')}>
                  {relationWarning(s.methodEvictConfirm, 'editEvict')}
                  <div className={c('delete-actions')}>
                    <BaseButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => settleEvict(false)}
                    >
                      {t('contacts.detailView.cancelBtn')}
                    </BaseButton>
                    <BaseButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => settleEvict(true)}
                    >
                      {t('contacts.detailView.confirmSaveBtn')}
                    </BaseButton>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Non-phone methods (email etc.) */}
        {contact.contactMethods
          .filter((m) => m.methodType !== 'phone')
          .map((method) => (
            <div key={method.id} className={c('method-row')}>
              <div className={c('method-type-badge')}>
                <BaseIcon name="mail" />
              </div>
              {mode === 'view'
                ? viewFields(method.value, method.label)
                : methodEditFields(
                    method,
                    <input
                      value={editOf(method).value}
                      className={c('input input-sm')}
                      type="email"
                      placeholder={t('contacts.detailView.emailPlaceholder')}
                      onChange={(e) => patchEdit(method, { value: e.target.value })}
                    />,
                  )}
              {mode === 'edit' && (
                <div className={c('method-actions')}>
                  <BaseIconButton
                    name="delete"
                    label={t('contacts.detailView.removeBtn')}
                    size="sm"
                    tone="danger"
                    data-testid="remove-method-btn"
                    onClick={() => void requestRemoveMethod(method)}
                  />
                </div>
              )}
            </div>
          ))}

        {mode === 'edit' &&
          (s.showAddMethod && s.addMethodDuplicateConflict ? (
            duplicateDisclaimer(
              s.addMethodDuplicateConflict,
              () => {
                s.addMethodDuplicateConflict = null;
                s.showAddMethod = false;
              },
              () =>
                editConflict(s.addMethodDuplicateConflict, () => {
                  s.addMethodDuplicateConflict = null;
                  s.showAddMethod = false;
                }),
            )
          ) : s.showAddMethod ? (
            <div className={c('add-method-form')}>
              <div className={c('type-selector')}>
                {(['phone', 'email'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={c('type-btn', { 'type-btn--active': s.newMethodType === type })}
                    onClick={() => (s.newMethodType = type)}
                  >
                    <BaseIcon name={type === 'phone' ? 'phone' : 'mail'} />
                    {type === 'phone'
                      ? t('contacts.detailView.phoneTypeBtn')
                      : t('contacts.detailView.emailTypeBtn')}
                  </button>
                ))}
              </div>
              {s.newMethodType === 'phone' ? (
                <PhoneField
                  value={s.newMethodValue}
                  className={c('input')}
                  placeholder={t('contacts.detailView.phonePlaceholder')}
                  onChange={(value) => (s.newMethodValue = value)}
                />
              ) : (
                <input
                  value={s.newMethodValue}
                  className={c('input')}
                  type="email"
                  placeholder={t('contacts.detailView.emailPlaceholder')}
                  onChange={(e) => (s.newMethodValue = e.target.value)}
                />
              )}
              <input
                value={s.newMethodLabel}
                className={c('input')}
                type="text"
                placeholder={t('contacts.detailView.labelExamplePlaceholder')}
                onChange={(e) => (s.newMethodLabel = e.target.value)}
              />
              {s.addMethodError && <p className={c('error-text')}>{s.addMethodError}</p>}
              <div className={c('add-method-actions')}>
                <BaseButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    s.showAddMethod = false;
                    s.addMethodError = null;
                    s.addMethodDuplicateConflict = null;
                  }}
                >
                  {t('contacts.shared.cancelBtn')}
                </BaseButton>
                <BaseButton
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={s.isAddingMethod}
                  onClick={() => void confirmAddMethod()}
                >
                  {s.isAddingMethod
                    ? t('contacts.detailView.addingBtn')
                    : t('contacts.detailView.addBtn')}
                </BaseButton>
              </div>
            </div>
          ) : (
            <BaseButton
              variant="text"
              size="sm"
              className={c('add-method-btn')}
              onClick={openAddMethod}
            >
              <BaseIcon name="add" />
              {t('contacts.detailView.addMethodBtn')}
            </BaseButton>
          ))}
      </section>

      {/* Form-level Save / Cancel; a full-screen page's top bar supplies them instead. */}
      {mode === 'edit' && !embedded && (
        <section className={c('section section--actions')}>
          {s.saveError && <p className={c('error-text')}>{s.saveError}</p>}
          <div className={c('form-actions')}>
            <BaseButton
              type="button"
              variant="secondary"
              disabled={s.isSaving}
              onClick={cancelEdit}
            >
              {t('contacts.detailView.cancelBtn')}
            </BaseButton>
            <BaseButton
              type="button"
              variant="primary"
              disabled={s.isSaving || !canSave}
              onClick={() => void saveAll()}
            >
              {s.isSaving ? t('contacts.detailView.savingBtn') : t('contacts.detailView.saveBtn')}
            </BaseButton>
          </div>
        </section>
      )}
    </div>
  );
}
