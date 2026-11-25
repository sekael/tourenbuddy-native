import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createLogger } from '@/core/logging/logger';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { resolveFriendName } from '@/features/friendships/domain/resolve-friend-name';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useTourLinksStore } from '@/features/tour-links/presentation/stores/tour-links-store';
import { COLLISION_RADIUS_M, sharesActivity } from '@/features/tours/domain/collision';
import { isSameGoal } from '@/features/tours/domain/distance';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import styles from './collision-notice.module.css';

const c = classes(styles);
const logger = createLogger('collision-notice');

// Persistence keys for the merge-blocked disclaimer (the PWA's).
const FOREVER_HIDE_KEY = 'tourLinks.mergeBlockedDisclaimer.hide';
const sessionHideKey = (tourId: string) => `tourLinks.mergeBlockedDisclaimer.dismissed.${tourId}`;

function storageGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function storageSet(storage: () => Storage, key: string, val: string) {
  try {
    storage().setItem(key, val);
  } catch {
    // ignore quota / privacy mode
  }
}

/** A friend's tour on the same goal and activity: offer to link it (or say why it can't be). */
export function CollisionNotice({ ownTourId }: { ownTourId: string }) {
  const { t } = useTranslation('web');
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const requestsByTourId = useTourLinksStore((s) => s.requestsByTourId);
  const groupIdByTourId = useTourLinksStore((s) => s.groupIdByTourId);
  const members = useTourLinksStore((s) => s.members);
  const pendingRequests = useTourLinksStore((s) => s.pendingRequests);
  const phoneMap = useFriendshipsStore((s) => s.userIdToPhoneMap);
  const friendUserIds = useFriendshipsStore((s) => s.friendUserIds);
  useContactsStore((s) => s.contacts);

  // Friend tours and link groups have realtime gaps (RLS hides other groups' rows): refetch on
  // mount and on a tour switch, so the notice reflects the server.
  useEffect(() => {
    void useTourLinksStore.getState().fetchAll();
    void useToursStore.getState().loadFriendTours();
  }, [ownTourId]);
  // A link-state shift may have flipped a friend's tour to private in the same transition: refresh
  // friend tours so the link button never lingers for a now-private tour.
  const firstShift = useState({ done: false })[0];
  useEffect(() => {
    if (!firstShift.done) {
      firstShift.done = true;
      return;
    }
    void useToursStore.getState().loadFriendTours();
  }, [members, pendingRequests]);

  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [foreverHidden, setForeverHidden] = useState(
    () => storageGet(() => localStorage, FOREVER_HIDE_KEY) === '1',
  );
  const [dismissedFor, setDismissedFor] = useState<Record<string, boolean>>({});
  const sessionDismissed =
    dismissedFor[ownTourId] ?? storageGet(() => sessionStorage, sessionHideKey(ownTourId)) === '1';
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  useEffect(() => setDoNotShowAgain(false), [ownTourId]);

  /**
   * Eligible friend tours: linkable (no group conflict) or blocked (both tours in different
   * groups: the DB rejects the merge). `friendTours` is already RLS-scoped to friends.
   */
  const own = tours.find((x) => x.id === ownTourId);
  const linkable: Tour[] = [];
  const blocked: Tour[] = [];
  if (own && own.visibility === 'friends' && own.tourTypes.length) {
    const myGroupId = groupIdByTourId.get(ownTourId);
    const pendingFriendTourIds = new Set(
      (requestsByTourId.get(ownTourId) ?? [])
        .flatMap((r) => [r.initiatorTourId, r.targetTourId])
        .filter((id) => id !== ownTourId),
    );
    for (const f of friendTours) {
      if (!sharesActivity(f.tourTypes, own.tourTypes)) continue;
      // Belt-and-suspenders against a stale cache: never offer a now-private or ex-friend tour.
      if (f.visibility !== 'friends') continue;
      if (!friendUserIds.has(f.userId)) continue;
      if (!isSameGoal(own.goal, f.goal, COLLISION_RADIUS_M)) continue;
      if (pendingFriendTourIds.has(f.id)) continue;
      // Merge-forbidden needs both tours grouped in different groups; same group is "already
      // linked" — skipped silently.
      const friendGroupId = groupIdByTourId.get(f.id);
      if (!myGroupId || !friendGroupId) linkable.push(f);
      else if (friendGroupId !== myGroupId) blocked.push(f);
    }
  }
  const showBlockedDisclaimer = blocked.length > 0 && !foreverHidden && !sessionDismissed;

  // Candidates are always confirmed friends: the viewer's own contact name for them.
  const nameFor = (userId: string) =>
    resolveFriendName(userId, phoneMap, (phone) =>
      useContactsStore.getState().findContactByMethodValue('phone', phone),
    ) ?? t('tours.list.aFriend');
  const linkableNames = linkable.map((f) => nameFor(f.userId));
  const blockedNames = blocked.map((f) => nameFor(f.userId));

  // One batched phone lookup for the whole candidate list.
  const candidateKey = [...linkable, ...blocked].map((f) => f.userId).join();
  useEffect(() => {
    const ids = [...new Set([...linkable, ...blocked].map((f) => f.userId))];
    if (ids.length > 0) void useFriendshipsStore.getState().ensurePhones(ids);
  }, [candidateKey]);

  async function requestLink(friendTourId: string) {
    setSubmitting(friendTourId);
    setSubmitError(null);
    try {
      await useTourLinksStore.getState().createRequest(ownTourId, friendTourId);
    } catch (err) {
      logger.error('createRequest failed', err);
      setSubmitError(err instanceof Error ? err.message : 'failed');
    } finally {
      setSubmitting(null);
    }
  }

  function dismissBlocked() {
    if (doNotShowAgain) {
      storageSet(() => localStorage, FOREVER_HIDE_KEY, '1');
      setForeverHidden(true);
    } else {
      storageSet(() => sessionStorage, sessionHideKey(ownTourId), '1');
      setDismissedFor((d) => ({ ...d, [ownTourId]: true }));
    }
  }

  return (
    <>
      {linkable.length > 0 && (
        <section className={c('collision-notice')}>
          <div className={c('header')}>
            <BaseIcon name="link" className={c('icon')} />
            <span className={c('title')}>{t('tourLinks.collisionNoticeTitle')}</span>
          </div>
          <p className={c('body')}>
            {t('tourLinks.collisionNoticeBody', { names: linkableNames.join(', ') })}
          </p>
          <div className={c('actions')}>
            {linkable.map((f, idx) => (
              <BaseButton
                key={f.id}
                variant="primary-outline"
                size="sm"
                disabled={submitting !== null}
                onClick={() => void requestLink(f.id)}
              >
                {submitting === f.id
                  ? t('tourLinks.requestingBtn')
                  : t('tourLinks.requestToLinkBtn', { name: linkableNames[idx] })}
              </BaseButton>
            ))}
          </div>
          {submitError && <p className={c('error')}>{submitError}</p>}
        </section>
      )}
      {showBlockedDisclaimer && (
        <section className={c('collision-notice collision-notice--blocked')}>
          <div className={c('header')}>
            <BaseIcon name="info" className={c('icon')} />
            <span className={c('title')}>{t('tourLinks.mergeBlockedTitle')}</span>
          </div>
          <p className={c('body')}>
            {t('tourLinks.mergeBlockedBody', { names: blockedNames.join(', ') })}
          </p>
          <label className={c('dont-show')}>
            <input
              type="checkbox"
              checked={doNotShowAgain}
              onChange={(e) => setDoNotShowAgain(e.target.checked)}
            />
            <span>{t('tourLinks.doNotShowAgain')}</span>
          </label>
          <div className={c('actions')}>
            <BaseButton variant="primary-outline" size="sm" onClick={dismissBlocked}>
              {t('tourLinks.dismissBtn')}
            </BaseButton>
          </div>
        </section>
      )}
    </>
  );
}
