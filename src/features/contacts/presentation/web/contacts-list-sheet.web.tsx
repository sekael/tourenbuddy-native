import { useEffect, useRef, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { DuplicateContactAcrossContactsError, VCardImportError } from '@/core/exceptions';
import { normalizePhone } from '@/core/utils/phone-normalize';
import { AdaptiveOverlay } from '@/core/web/adaptive-overlay.web';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseTooltip } from '@/core/web/base-tooltip.web';
import { classes } from '@/core/web/classes';
import { Transition } from '@/core/web/transition.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useReactive } from '@/core/web/use-reactive.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import {
  formatPhoneDisplay,
  getPrimaryPhone,
  resolveContactName,
  type Contact,
} from '@/features/contacts/domain/entities/contact';
import { phoneKey } from '@/features/contacts/presentation/contact-links';
import {
  importContacts,
  type ImportResult,
  type ParsedImportItem,
} from '@/features/contacts/presentation/import-contacts';
import {
  useContactsStore,
  type PhoneEntry,
} from '@/features/contacts/presentation/stores/contacts-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';
import { ConnectPrompt } from '@/features/friendships/presentation/web/connect-prompt.web';

import { ContactDetailActions } from './contact-detail-actions.web';
import {
  ContactDetailView,
  type ContactDetailHandle,
  type DetailMode,
} from './contact-detail-view.web';
import { ContactForm, type ContactFormData, type ContactFormHandle } from './contact-form.web';
import { ContactImportHelp } from './contact-import-help.web';
import { isContactPickerSupported, parseVCardFile, pickContacts } from './contact-picker.web';
import styles from './contacts-list-sheet.module.css';
import { useDismissedConnectPrompts } from './use-dismissed-connect-prompts.web';
import { usePhoneDirectory } from './use-phone-directory.web';

const c = classes(styles);
type ViewState = 'list' | 'detail' | 'add';

/** Contacts: the list, one contact (view/edit), and adding (form or import). */
export function ContactsListSheet({
  initialContactId,
  onClose,
  onOpenFriendRequests,
  onShowFriendTours,
}: {
  /** When given, opens that contact's detail. */
  initialContactId?: string | null;
  onClose: () => void;
  onOpenFriendRequests: () => void;
  onShowFriendTours: (userId: string) => void;
}) {
  'use no memo';
  const { t } = useTranslation('web');
  const contacts = useContactsStore((s) => s.contacts);
  const isLoading = useContactsStore((s) => s.isLoading);
  const friendUserIds = useFriendshipsStore((s) => s.friendUserIds);
  const outgoing = useFriendshipsStore((s) => s.outgoing);
  const incoming = useFriendshipsStore((s) => s.incoming);
  const blockedPhones = useUserBlocksStore((s) => s.blockedPhones);
  const callerPhoneVerified = useAuthStore((s) => s.user?.phone_confirmed_at != null);
  const isDesktop = useIsDesktop();
  const contactsStore = () => useContactsStore.getState();
  const pendingIncomingCount = incoming.filter((r) => r.status === 'pending').length;

  const s = useReactive(() => ({
    viewState: 'list' as ViewState,
    selectedId: null as string | null,
    // Edit mode lives here so it survives the sheet → full-screen page swap.
    detailEditMode: 'view' as DetailMode,
    detailSaving: false,
    addViewState: 'form' as 'form' | 'import-results',
    importResults: [] as ImportResult[],
    duplicateConflict: null as Contact | 'generic' | null,
    addError: null as string | null,
    isAddLoading: false,
    manualPromptUserId: null as string | null,
    manualPromptDismissed: false,
    importRowMatches: [] as string[][],
  }));
  const detailRef = useRef<ContactDetailHandle>(null);
  const addFormRef = useRef<ContactFormHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const phoneDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phoneToUserIdMap, setPhoneToUserIdMap] = usePhoneDirectory(contacts, callerPhoneVerified);
  const { isDismissed, dismiss } = useDismissedConnectPrompts();

  // Opens the given contact once it is loaded.
  useEffect(() => {
    if (
      initialContactId &&
      s.viewState === 'list' &&
      contacts.some((x) => x.id === initialContactId)
    ) {
      s.selectedId = initialContactId;
      s.viewState = 'detail';
    }
  }, [initialContactId, contacts]);

  const liveContact = s.selectedId ? (contacts.find((x) => x.id === s.selectedId) ?? null) : null;
  // A contact deleted meanwhile returns to the list.
  useEffect(() => {
    if (s.viewState === 'detail' && !liveContact) {
      s.viewState = 'list';
      s.selectedId = null;
    }
  }, [liveContact]);

  const sheetTitle =
    s.viewState === 'add'
      ? t('contacts.addDialog.title')
      : s.viewState === 'detail'
        ? liveContact
          ? resolveContactName(liveContact)
          : undefined
        : t('contacts.list.title');

  // On phones a data-entry surface (the add form, a contact in edit mode) is a full-screen page.
  const addFormPage = s.viewState === 'add' && s.addViewState === 'form';
  const detailEditPage = s.viewState === 'detail' && s.detailEditMode === 'edit';
  const contactPage = !isDesktop && (addFormPage || detailEditPage);
  const importSummary = {
    imported: s.importResults.filter((r) => r.status === 'imported').length,
    phoneDuplicate: s.importResults.filter((r) => r.skipReason === 'phoneDuplicate').length,
    nameDuplicate: s.importResults.filter((r) => r.skipReason === 'nameDuplicate').length,
    unparseable: s.importResults.filter((r) => r.skipReason === 'unparseable').length,
  };

  const friendContactIds = new Set<string>();
  const blockedContactIds = new Set<string>();
  for (const contact of contacts)
    for (const m of contact.contactMethods) {
      if (m.methodType !== 'phone') continue;
      const phone = phoneKey(m.value);
      const uid = phoneToUserIdMap.get(phone);
      if (uid && friendUserIds.has(uid)) friendContactIds.add(contact.id);
      if (blockedPhones.has(phone)) blockedContactIds.add(contact.id);
    }

  const phonesOf = (contact: Contact) =>
    contact.contactMethods.filter((m) => m.methodType === 'phone').map((m) => phoneKey(m.value));
  const hasPendingTo = (uid: string) =>
    useFriendshipsStore
      .getState()
      .outgoing.some((r) => r.toUserId === uid && r.status === 'pending');
  // Linked friend (drives the delete disclaimer) and the user to connect with.
  const detailLinkedFriendUserId = liveContact
    ? (phonesOf(liveContact)
        .map((p) => phoneToUserIdMap.get(p))
        .find((uid): uid is string => !!uid && friendUserIds.has(uid)) ?? null)
    : null;
  const detailViewMatchedUserId =
    liveContact && callerPhoneVerified
      ? (phonesOf(liveContact)
          .map((p) => phoneToUserIdMap.get(p))
          .find(
            (uid): uid is string =>
              !!uid &&
              !friendUserIds.has(uid) &&
              !outgoing.some((r) => r.toUserId === uid && r.status === 'pending'),
          ) ?? null)
      : null;

  function openDetail(contact: Contact) {
    s.selectedId = contact.id;
    s.detailEditMode = 'view';
    s.viewState = 'detail';
  }

  function openAdd() {
    s.addError = null;
    s.duplicateConflict = null;
    s.importResults = [];
    s.addViewState = 'form';
    s.viewState = 'add';
  }

  function backToList() {
    s.viewState = 'list';
    s.selectedId = null;
    s.detailEditMode = 'view';
  }

  function handleClose() {
    if (s.viewState !== 'list') backToList();
    else onClose();
  }

  // Top-left control of the full-screen page: cancels a contact's edit, or leaves the add form.
  function handlePageBack() {
    if (detailEditPage) detailRef.current?.cancelEdit();
    else backToList();
  }

  const commitDetailEdits = () => detailRef.current?.commitPendingEdits() ?? Promise.resolve();

  // ── A new contact reusing a phone already on another contact
  function editConflictingContact() {
    const conflict = s.duplicateConflict;
    if (!conflict || conflict === 'generic') return;
    s.duplicateConflict = null;
    openDetail(conflict);
    s.detailEditMode = 'edit';
  }

  async function persistNewContact(data: ContactFormData) {
    const conflict = data.phones
      .map((p: PhoneEntry) => contactsStore().findContactByMethodValue('phone', p.value))
      .find(Boolean);
    if (conflict) {
      s.duplicateConflict = conflict;
      throw new DuplicateContactAcrossContactsError();
    }
    s.isAddLoading = true;
    s.addError = null;
    try {
      await contactsStore().addContact(
        data.firstName,
        data.lastName,
        data.displayName,
        data.phones,
      );
    } catch (err) {
      // Slipped past the pre-check (stale cache, race): a generic disclaimer, discard only.
      if (err instanceof DuplicateContactAcrossContactsError) s.duplicateConflict = 'generic';
      else s.addError = err instanceof Error ? err.message : t('contacts.addDialog.addError');
      throw err;
    } finally {
      s.isAddLoading = false;
    }
  }

  async function handleAddSubmit(data: ContactFormData) {
    try {
      await persistNewContact(data);
      backToList();
    } catch {
      // persistNewContact set addError / duplicateConflict
    }
  }

  async function commitAddFormForConnect() {
    if (!addFormRef.current) return;
    await persistNewContact(addFormRef.current.validateAndCollect());
  }

  function handleAddConnectSent() {
    s.manualPromptDismissed = true;
    backToList();
  }

  /** A duplicate skip outranks a phone complaint: nothing was attempted, nothing was rejected. */
  const showsRawPhones = (r: ImportResult) =>
    r.rawPhoneNumbers.length > 0 &&
    r.skipReason !== 'nameDuplicate' &&
    r.skipReason !== 'phoneDuplicate';

  /** Skipped: nothing was created (error tone); imported: only these numbers were dropped. */
  function rawPhoneSummary(r: ImportResult) {
    const [first, ...rest] = r.rawPhoneNumbers;
    const extra = rest.length
      ? ` ${t('contacts.addDialog.extraPhones', { count: rest.length })}`
      : '';
    const label =
      r.status === 'imported'
        ? t('contacts.addDialog.discardedPhones')
        : t('contacts.list.invalidPhoneWarning');
    return `${label}: ${first}${extra}`;
  }

  async function processImportedContacts(items: ParsedImportItem[]) {
    const results = await importContacts(items);
    s.importResults = results;
    s.addViewState = 'import-results';
    // Connect prompts per imported row (only with a verified phone).
    if (!callerPhoneVerified) return;
    const uniquePhones = [...new Set(items.flatMap((i) => i.phones.map((p) => p.value)))].filter(
      Boolean,
    );
    if (!uniquePhones.length) return;
    const matches = await useFriendshipsStore.getState().findUsersByPhones(uniquePhones);
    const map = new Map(phoneToUserIdMap);
    for (const m of matches) map.set(m.phone, m.userId);
    setPhoneToUserIdMap(map);
    const friends = useFriendshipsStore.getState().friendUserIds;
    s.importRowMatches = results.map((r) => {
      const match = r.primaryPhone ? map.get(r.primaryPhone) : undefined;
      return match && !friends.has(match) ? [match] : [];
    });
  }

  async function handleContactPickerImport() {
    s.isAddLoading = true;
    s.addError = null;
    try {
      await processImportedContacts(await pickContacts());
    } catch (err) {
      s.addError = err instanceof Error ? err.message : t('contacts.addDialog.importError');
    } finally {
      s.isAddLoading = false;
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    s.isAddLoading = true;
    s.addError = null;
    try {
      await processImportedContacts(await parseVCardFile(file));
    } catch (err) {
      // A validated failure names its cause; an I/O rejection stays generic. The form stays.
      s.addError =
        err instanceof VCardImportError
          ? (t as unknown as (k: string) => string)(`contacts.addDialog.fileError.${err.reason}`)
          : err instanceof Error
            ? err.message
            : t('contacts.addDialog.fileImportError');
    } finally {
      s.isAddLoading = false;
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function switchAddToForm() {
    s.addViewState = 'form';
    s.importResults = [];
    s.addError = null;
    s.manualPromptUserId = null;
    s.manualPromptDismissed = false;
  }

  // ── Connect prompt for the manual form
  async function lookupPhoneForPrompt(phone: string) {
    const result = normalizePhone(phone);
    if (!callerPhoneVerified || !result.ok) {
      s.manualPromptUserId = null;
      return;
    }
    const uid = await useFriendshipsStore.getState().findUserByPhone(result.e164);
    s.manualPromptUserId =
      !uid || useFriendshipsStore.getState().friendUserIds.has(uid) || hasPendingTo(uid)
        ? null
        : uid;
  }

  function onFormPhoneInput(phone: string) {
    s.manualPromptDismissed = false;
    if (phoneDebounce.current) clearTimeout(phoneDebounce.current);
    phoneDebounce.current = setTimeout(() => void lookupPhoneForPrompt(phone), 400);
  }
  useEffect(
    () => () => {
      if (phoneDebounce.current) clearTimeout(phoneDebounce.current);
    },
    [],
  );

  const listView = (
    <div key="list" className={c('list-view')}>
      <div className={c('list-actions-row')}>
        <BaseButton
          variant="secondary"
          size="sm"
          data-tour="add-contact"
          data-testid="add-contact-btn"
          onClick={openAdd}
        >
          <BaseIcon name="person_add" size="sm" />
          {t('contacts.list.addBtn')}
        </BaseButton>
        {/* Always rendered (discoverability, onboarding waypoint); disabled until the phone is verified. */}
        <BaseTooltip text={t('friendships.verifyPhoneHint')} disabled={callerPhoneVerified}>
          <BaseButton
            variant="secondary"
            size="sm"
            data-tour="open-friend-requests"
            disabled={!callerPhoneVerified}
            aria-disabled={!callerPhoneVerified}
            onClick={onOpenFriendRequests}
          >
            <BaseIcon name="group" size="sm" />
            {t('friendships.friendsListLink')}
            {pendingIncomingCount > 0 && <span className={c('badge')}>{pendingIncomingCount}</span>}
          </BaseButton>
        </BaseTooltip>
      </div>

      <div className={c('contacts-content')} data-tour="contacts">
        {isLoading ? (
          <div className={c('loading-text')}>{t('contacts.list.loading')}</div>
        ) : contacts.length === 0 ? (
          <div className={c('empty-state')}>
            <BaseIcon name="group" className={c('empty-icon')} size="xl" />
            <p className={c('empty-text')}>{t('contacts.list.emptyTitle')}</p>
            <p className={c('empty-sub')}>{t('contacts.list.emptySubtitle')}</p>
          </div>
        ) : (
          <ul className={c('contacts-list')}>
            {contacts.map((contact) => {
              const name = resolveContactName(contact);
              const primary = getPrimaryPhone(contact);
              const blocked = blockedContactIds.has(contact.id);
              return (
                <li
                  key={contact.id}
                  className={c('contact-row')}
                  onClick={() => openDetail(contact)}
                >
                  <div className={c('contact-avatar')}>{name[0]?.toUpperCase()}</div>
                  <div className={c('contact-info')}>
                    <span className={c('contact-name-row')}>
                      <span className={c('contact-name')}>{name}</span>
                      {friendContactIds.has(contact.id) && !blocked && (
                        <BaseTooltip text={t('friendships.tooltip')}>
                          <BaseIcon name="group" className={c('friend-icon')} />
                        </BaseTooltip>
                      )}
                      {blocked && (
                        <BaseTooltip text={t('blocks.tooltip')}>
                          <BaseIcon name="block" className={c('blocked-icon')} />
                        </BaseTooltip>
                      )}
                    </span>
                    {primary && (
                      <span className={c('contact-subtitle')}>{formatPhoneDisplay(primary)}</span>
                    )}
                  </div>
                  <BaseIcon name="chevron_right" className={c('row-arrow')} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  const detailView = liveContact && (
    <div key="detail">
      <ContactDetailView
        ref={detailRef}
        mode={s.detailEditMode}
        contact={liveContact}
        linkedFriendUserId={detailLinkedFriendUserId}
        embedded={detailEditPage && !isDesktop}
        onModeChange={(mode) => (s.detailEditMode = mode)}
        onSavingChange={(saving) => (s.detailSaving = saving)}
        onEditContact={(contact) => {
          openDetail(contact);
          s.detailEditMode = 'edit';
        }}
        onShowTours={onShowFriendTours}
      />
      {detailViewMatchedUserId && !isDismissed(liveContact.id) && (
        <ConnectPrompt
          matchedUserId={detailViewMatchedUserId}
          beforeSend={commitDetailEdits}
          beforeDismiss={s.detailEditMode === 'edit' ? commitDetailEdits : undefined}
          showDismiss={s.detailEditMode === 'edit'}
          className={c('detail-connect-prompt')}
          onSent={() => dismiss(liveContact.id)}
          onDismissed={() => dismiss(liveContact.id)}
        />
      )}
    </div>
  );

  const importResultsView = (
    <div className={c('results-view')}>
      <ul className={c('results-summary-box')}>
        {importSummary.imported > 0 && (
          <li>{t('contacts.addDialog.summaryImported', { count: importSummary.imported })}</li>
        )}
        {importSummary.phoneDuplicate > 0 && (
          <li>
            {t('contacts.addDialog.summaryPhoneDuplicate', {
              count: importSummary.phoneDuplicate,
            })}
          </li>
        )}
        {importSummary.nameDuplicate > 0 && (
          <li>
            {t('contacts.addDialog.summaryNameDuplicate', { count: importSummary.nameDuplicate })}
          </li>
        )}
        {importSummary.unparseable > 0 && (
          <li>
            {t('contacts.addDialog.summaryUnparseable', { count: importSummary.unparseable })}
          </li>
        )}
      </ul>
      <ul className={c('results-list')}>
        {s.importResults.map((result, i) => (
          <li key={i} className={c('result-item')}>
            <div className={c('result-info')}>
              <span className={c('result-name')}>
                {result.firstName}
                {result.lastName ? ` ${result.lastName}` : ''}
              </span>
              {result.primaryPhone && (
                <span className={c('result-phone')}>
                  <BaseIcon name="star" className={c('star-icon-sm')} />
                  {formatPhoneDisplay(result.primaryPhone)}
                  {result.extraPhoneCount > 0 && (
                    <span className={c('extra-phones')}>
                      {t('contacts.addDialog.extraPhones', { count: result.extraPhoneCount })}
                    </span>
                  )}
                </span>
              )}
              {showsRawPhones(result) && (
                <BaseTooltip
                  text={t('contacts.addDialog.unparseableTooltip', {
                    values: result.rawPhoneNumbers.join(', '),
                  })}
                >
                  <span
                    className={c(
                      'result-phone',
                      result.status === 'imported'
                        ? 'result-phone-discarded'
                        : 'result-phone-warning',
                    )}
                  >
                    ⚠ {rawPhoneSummary(result)}
                  </span>
                </BaseTooltip>
              )}
              {s.importRowMatches[i]?.map((uid) => (
                <ConnectPrompt
                  key={uid}
                  matchedUserId={uid}
                  onDismissed={() =>
                    (s.importRowMatches = s.importRowMatches.map((row, j) =>
                      j === i ? row.filter((u) => u !== uid) : row,
                    ))
                  }
                />
              ))}
            </div>
            <span
              className={c(
                'result-badge',
                result.status === 'imported' ? 'badge-imported' : 'badge-skipped',
              )}
            >
              {result.status === 'imported'
                ? t('contacts.list.importedLabel')
                : result.skipReason === 'phoneDuplicate'
                  ? t('contacts.addDialog.summaryPhoneDuplicateBadge')
                  : t('contacts.list.skippedLabel')}
            </span>
          </li>
        ))}
      </ul>
      <div className={c('results-actions')}>
        <BaseButton variant="text" size="sm" onClick={switchAddToForm}>
          <BaseIcon name="add" size="sm" />
          {t('contacts.list.addManuallyBtn')}
        </BaseButton>
        <BaseButton type="button" variant="primary" onClick={backToList}>
          {t('contacts.addDialog.doneBtn')}
        </BaseButton>
      </div>
    </div>
  );

  const addForm = (
    <div className={c('form-wrapper')}>
      <div className={c('import-actions')}>
        <BaseButton
          variant="secondary"
          size="sm"
          data-testid="import-file-btn"
          disabled={s.isAddLoading}
          onClick={() => fileInput.current?.click()}
        >
          <BaseIcon name="upload_file" size="sm" />
          {t('contacts.addDialog.importFileBtn')}
        </BaseButton>
        {isContactPickerSupported && (
          <BaseButton
            variant="secondary"
            size="sm"
            data-testid="import-picker-btn"
            disabled={s.isAddLoading}
            onClick={() => void handleContactPickerImport()}
          >
            <BaseIcon name="contacts" size="sm" />
            {t('contacts.addDialog.importContactsBtn')}
          </BaseButton>
        )}
        {/* No `multiple`: one file only. */}
        <input
          ref={fileInput}
          type="file"
          accept=".vcf,.vcard,text/vcard,text/x-vcard"
          className={c('file-input-hidden')}
          onChange={(e) => void handleFileChange(e)}
        />
      </div>
      <p className={c('format-hint')}>{t('contacts.addDialog.help.formatHint')}</p>
      <ContactImportHelp />
      <div className={c('divider')} />

      {s.duplicateConflict ? (
        <div className={c('duplicate-disclaimer')}>
          <p className={c('duplicate-title')}>
            <BaseIcon name="warning" className={c('warn-icon')} />
            {t('contacts.shared.duplicateTitle')}
          </p>
          <p className={c('duplicate-text')}>
            {s.duplicateConflict === 'generic'
              ? t('contacts.shared.duplicateGenericText')
              : t('contacts.shared.duplicateText', {
                  name: resolveContactName(s.duplicateConflict),
                })}
          </p>
          <div className={c('duplicate-actions')}>
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                s.duplicateConflict = null;
                backToList();
              }}
            >
              {t('contacts.shared.discardBtn')}
            </BaseButton>
            {s.duplicateConflict !== 'generic' && (
              <BaseButton
                type="button"
                variant="primary"
                size="sm"
                onClick={editConflictingContact}
              >
                {t('contacts.shared.editExistingBtn')}
              </BaseButton>
            )}
          </div>
        </div>
      ) : (
        <>
          {s.addError && <p className={c('error-text')}>{s.addError}</p>}
          <ContactForm
            ref={addFormRef}
            formId="contact-add-form"
            embedded={addFormPage && !isDesktop}
            submitLabel={t('contacts.addDialog.title')}
            isLoading={s.isAddLoading}
            onSubmit={(data) => void handleAddSubmit(data)}
            onCancel={backToList}
            onPhoneChange={onFormPhoneInput}
          />
          {s.manualPromptUserId && !s.manualPromptDismissed && (
            <ConnectPrompt
              matchedUserId={s.manualPromptUserId}
              beforeSend={commitAddFormForConnect}
              beforeDismiss={commitAddFormForConnect}
              onSent={handleAddConnectSent}
              onDismissed={handleAddConnectSent}
            />
          )}
        </>
      )}
    </div>
  );

  return (
    <AdaptiveOverlay
      title={sheetTitle}
      page={contactPage}
      showBack={contactPage || s.viewState === 'detail'}
      onClose={handleClose}
      onBack={handlePageBack}
      pageAction={
        !contactPage ? undefined : addFormPage ? (
          <BaseButton
            type="submit"
            form="contact-add-form"
            variant="primary"
            size="sm"
            disabled={s.isAddLoading}
          >
            {t('contacts.addDialog.title')}
          </BaseButton>
        ) : (
          <BaseButton
            type="button"
            variant="primary"
            size="sm"
            disabled={s.detailSaving}
            onClick={() => void detailRef.current?.saveAll()}
          >
            {s.detailSaving ? t('contacts.detailView.savingBtn') : t('contacts.detailView.saveBtn')}
          </BaseButton>
        )
      }
      footer={
        s.viewState === 'detail' && liveContact && s.detailEditMode === 'view' ? (
          <ContactDetailActions
            contact={liveContact}
            linkedFriendUserId={detailLinkedFriendUserId}
            onEdit={() => detailRef.current?.enterEditMode()}
            onDeleted={backToList}
          />
        ) : undefined
      }
    >
      {/* Views push/pop: forward slides in from the right, back from the left. */}
      <Transition name={s.viewState === 'list' ? 'view-pop' : 'view-push'}>
        {s.viewState === 'list' ? (
          listView
        ) : s.viewState === 'detail' && liveContact ? (
          detailView
        ) : s.viewState === 'add' ? (
          <div key="add" className={c('add-view')}>
            {s.addViewState === 'import-results' ? importResultsView : addForm}
          </div>
        ) : null}
      </Transition>
    </AdaptiveOverlay>
  );
}
