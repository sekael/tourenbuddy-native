import { useEffect, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';

import { connectivity } from '@/core/offline/online';
import { formatPhoneForDisplay } from '@/core/utils/phone-normalize';
import { AdaptiveOverlay } from '@/core/web/adaptive-overlay.web';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useSnackbar } from '@/core/web/use-snackbar.web';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import type { FriendRequest } from '@/features/friendships/data/models/friendship-schemas';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';

import { BlockConfirmDialog } from './block-confirm-dialog.web';
import { BlockedList } from './blocked-list.web';
import styles from './friend-requests-sheet.module.css';

const c = classes(styles);
type Tab = 'pending' | 'blocked';

/** Friend requests both ways, and the blocked people, in two tabs. */
export function FriendRequestsSheet({
  onClose,
  onBack,
}: {
  onClose: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation('web');
  const incoming = useFriendshipsStore((s) => s.incoming);
  const outgoing = useFriendshipsStore((s) => s.outgoing);
  const isLoading = useFriendshipsStore((s) => s.isLoading);
  const userIdToPhoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const userIdToNamesMap = useFriendshipsStore((s) => s.userIdToNamesMap);
  const contacts = useContactsStore((s) => s.contacts);
  const blockedUserIds = useUserBlocksStore((s) => s.blockedUserIds);
  const online = useStore(connectivity, (s) => s.online);
  const isDesktop = useIsDesktop();
  // ponytail: the PWA shows these messages through a snackbar it never renders here; kept as is.
  const snackbar = useSnackbar();
  const store = useFriendshipsStore.getState();
  const contactsStore = () => useContactsStore.getState();
  const [activeTab, setActiveTab] = useState<Tab>('pending');

  // Only the FIRST load blanks the view; background refetches keep the list on screen.
  const showInitialLoading = isLoading && incoming.length === 0 && outgoing.length === 0;

  function phoneFor(userId: string): string {
    const e164 = userIdToPhoneMap.get(userId);
    return e164 ? formatPhoneForDisplay(e164) : userId;
  }

  function displayNameFor(req: FriendRequest, direction: 'incoming' | 'outgoing'): string | null {
    if (direction === 'incoming') {
      const entry = userIdToNamesMap.get(req.fromUserId);
      return entry ? `${entry.firstName ?? ''} ${entry.lastName ?? ''}`.trim() || null : null;
    }
    // Outgoing: the sender's own contact matched by the recipient's phone.
    const phone = userIdToPhoneMap.get(req.toUserId);
    const contact = phone ? contactsStore().findContactByMethodValue('phone', phone) : undefined;
    return contact ? `${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || null : null;
  }

  // Refetch on mount and whenever the contacts change (deleting one clears its pending requests).
  useEffect(() => void useFriendshipsStore.getState().fetchAll(), [contacts]);
  useEffect(() => {
    const phoneIds = [...incoming.map((r) => r.fromUserId), ...outgoing.map((r) => r.toUserId)];
    void (async () => {
      await store.findPhonesByUserIds([...new Set(phoneIds)]);
      await store.getNamesByUserIds([...new Set(incoming.map((r) => r.fromUserId))]);
    })();
  }, [incoming, outgoing]);

  async function maybeCreateContactForFriend(userId: string) {
    const { userIdToPhoneMap: phones, userIdToNamesMap: names } = useFriendshipsStore.getState();
    const phone = phones.get(userId);
    if (!phone || contactsStore().findContactByMethodValue('phone', phone)) return;
    const entry = names.get(userId);
    const firstName = entry?.firstName?.trim();
    const lastName = entry?.lastName?.trim() || null;
    const displayPhone = formatPhoneForDisplay(phone) || phone;
    if (firstName)
      await contactsStore().addContact(firstName, lastName, null, [
        { value: phone, isPrimary: true },
      ]);
    else
      await contactsStore().addContact(displayPhone, null, null, [
        { value: phone, isPrimary: true },
      ]);
    snackbar.show(t('friendships.contactCreated'));
  }

  const [confirmingRequestId, setConfirmingRequestId] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [blockingRequest, setBlockingRequest] = useState<FriendRequest | null>(null);

  async function handleBlockConfirm(reportReason: string | null) {
    const req = blockingRequest;
    if (!req) return;
    setBlockingRequest(null);
    const blocks = useUserBlocksStore.getState();
    try {
      await blocks.block(req.fromUserId);
      snackbar.show(t('blocks.snackbar.blockSuccess'));
      if (reportReason !== null) {
        await blocks.report(req.fromUserId, reportReason);
        snackbar.show(t('blocks.snackbar.reportSuccess'));
      }
    } catch {
      snackbar.show(t('blocks.snackbar.sendRequestFailed'));
    }
  }

  async function handleAccept(requestId: string) {
    const req = incoming.find((r) => r.id === requestId);
    setIsAccepting(true);
    try {
      await store.accept(requestId);
      if (req) {
        await store.getNamesByUserIds([req.fromUserId]);
        await maybeCreateContactForFriend(req.fromUserId);
      }
      setConfirmingRequestId(null);
    } catch {
      snackbar.show(`${t('friendships.accept')} failed`);
    } finally {
      setIsAccepting(false);
    }
  }

  const attempt = (action: () => Promise<void>, label: string) =>
    void action().catch(() => snackbar.show(`${label} failed`));

  const userBlock = (name: string | null, phone: string) =>
    name ? (
      <>
        <span className={c('request-user')}>{name}</span>
        <span className={c('request-phone-sub')}>{phone}</span>
      </>
    ) : (
      <span className={c('request-user')}>{phone}</span>
    );

  return (
    <AdaptiveOverlay
      title={t('friendships.friendsListLink')}
      showBack
      onClose={onClose}
      onBack={onBack}
    >
      <div className={c('content')}>
        <div
          className={c('tab-bar')}
          role="tablist"
          data-tour="friend-requests"
          data-tab-indicator
          style={
            { '--tab-index': activeTab === 'blocked' ? 1 : 0, '--tab-count': 2 } as CSSProperties
          }
        >
          <button
            type="button"
            role="tab"
            className={c('tab-btn')}
            aria-selected={activeTab === 'pending'}
            onClick={() => setActiveTab('pending')}
          >
            {t('friendships.requestsTab')}
          </button>
          <button
            type="button"
            role="tab"
            className={c('tab-btn')}
            aria-selected={activeTab === 'blocked'}
            onClick={() => setActiveTab('blocked')}
          >
            {t('blocks.tabLabel')}
          </button>
        </div>

        {/* Both panels stay rendered: on phones they share one grid cell, so switching tabs never
            resizes the sheet; the inactive panel is hidden and inert. */}
        <div className={c('tab-panels', { 'tab-panels--stacked': !isDesktop })}>
          <div
            className={c('tab-panel', { 'tab-panel--hidden': activeTab !== 'pending' })}
            role="tabpanel"
            inert={activeTab !== 'pending' || undefined}
          >
            {!online && (
              <div className={c('offline-note')}>
                <BaseIcon name="cloud_off" className={c('note-icon')} />
                <p className={c('note-text')}>{t('offlineSync.friendshipsOnlineOnly')}</p>
              </div>
            )}
            <div className={c('deny-rights-note')}>
              <BaseIcon name="info" className={c('note-icon')} />
              <p className={c('note-text')}>{t('friendships.inboxDenyRightsNote')}</p>
            </div>

            {showInitialLoading ? (
              <div className={c('loading-text')}>{t('contacts.list.loading')}</div>
            ) : (
              <>
                <section className={c('section')}>
                  <h2 className={c('section-title')}>{t('friendships.requestFrom')}</h2>
                  {incoming.length === 0 ? (
                    <div className={c('empty-state')}>{t('friendships.inboxEmpty')}</div>
                  ) : (
                    <ul className={c('request-list')}>
                      {incoming.map((req) => (
                        <li key={req.id} className={c('request-row')}>
                          {blockingRequest?.id === req.id ? (
                            <BlockConfirmDialog
                              hasFriendship={false}
                              onCancel={() => setBlockingRequest(null)}
                              onConfirm={(reason) => void handleBlockConfirm(reason)}
                            />
                          ) : confirmingRequestId === req.id ? (
                            <div className={c('confirm-content')}>
                              <p className={c('confirm-text')}>{t('friendships.acceptConfirm')}</p>
                              <p className={c('confirm-warning')}>
                                <BaseIcon name="warning" className={c('warn-icon')} />
                                {t('friendships.acceptWarning')}
                              </p>
                              <div className={c('confirm-actions')}>
                                <BaseButton
                                  variant="secondary"
                                  size="sm"
                                  className={c('action-btn')}
                                  data-testid="req-confirm-cancel"
                                  disabled={isAccepting}
                                  onClick={() => setConfirmingRequestId(null)}
                                >
                                  {t('friendships.cancel')}
                                </BaseButton>
                                <BaseButton
                                  variant="primary-outline"
                                  size="sm"
                                  className={c('action-btn')}
                                  data-testid="req-accept"
                                  disabled={isAccepting || !online}
                                  onClick={() => void handleAccept(req.id)}
                                >
                                  {isAccepting
                                    ? t('friendships.acceptingBtn')
                                    : t('friendships.accept')}
                                </BaseButton>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={c('request-info')}>
                                <BaseIcon name="person" className={c('request-icon')} />
                                <div className={c('request-user-block')}>
                                  {userBlock(
                                    displayNameFor(req, 'incoming'),
                                    phoneFor(req.fromUserId),
                                  )}
                                </div>
                              </div>
                              <div className={c('request-actions')}>
                                {!blockedUserIds.has(req.fromUserId) && (
                                  <BaseButton
                                    variant="danger-outline"
                                    size="sm"
                                    className={c('action-btn')}
                                    data-testid="req-block"
                                    disabled={!online}
                                    onClick={() => setBlockingRequest(req)}
                                  >
                                    {t('blocks.blockAction')}
                                  </BaseButton>
                                )}
                                <BaseButton
                                  variant="secondary"
                                  size="sm"
                                  className={c('action-btn')}
                                  data-testid="req-deny"
                                  disabled={!online}
                                  onClick={() =>
                                    attempt(() => store.deny(req.id), t('friendships.deny'))
                                  }
                                >
                                  {t('friendships.deny')}
                                </BaseButton>
                                <BaseButton
                                  variant="primary-outline"
                                  size="sm"
                                  className={c('action-btn')}
                                  data-testid="req-accept"
                                  disabled={!online}
                                  onClick={() => setConfirmingRequestId(req.id)}
                                >
                                  {t('friendships.accept')}
                                </BaseButton>
                              </div>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className={c('section')}>
                  <h2 className={c('section-title')}>{t('friendships.requestTo')}</h2>
                  {outgoing.length === 0 ? (
                    <div className={c('empty-state')}>{t('friendships.inboxEmpty')}</div>
                  ) : (
                    <ul className={c('request-list')}>
                      {outgoing.map((req) => (
                        <li key={req.id} className={c('request-row')}>
                          <div className={c('request-info')}>
                            <BaseIcon name="person" className={c('request-icon')} />
                            <div className={c('request-user-block')}>
                              {userBlock(displayNameFor(req, 'outgoing'), phoneFor(req.toUserId))}
                            </div>
                          </div>
                          <BaseButton
                            variant="secondary"
                            size="sm"
                            className={c('action-btn')}
                            data-testid="req-cancel"
                            disabled={!online}
                            onClick={() =>
                              attempt(() => store.cancel(req.id), t('friendships.cancel'))
                            }
                          >
                            {t('friendships.cancel')}
                          </BaseButton>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>

          <div
            className={c('tab-panel', { 'tab-panel--hidden': activeTab !== 'blocked' })}
            role="tabpanel"
            inert={activeTab !== 'blocked' || undefined}
          >
            <BlockedList />
          </div>
        </div>
      </div>
    </AdaptiveOverlay>
  );
}
