import { useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { classes } from '@/core/web/classes';
import { useFriendDisplayName } from '@/features/friendships/presentation/web/use-friend-display-name.web';
import type {
  InboxNotification,
  InboxStaleReason,
} from '@/features/notifications/domain/entities/inbox-notification';
import { inboxText, summaryFriendIds } from '@/features/notifications/presentation/inbox-text';

import styles from './inbox-item.module.css';

const c = classes(styles);
/** Past this share of the width a swipe deletes; short of it, the row snaps back. */
const SWIPE_THRESHOLD = 0.4;

/** One inbox entry: tap opens its subject, swipe left (or the bin) deletes it. */
export function InboxItem({
  entry,
  stale,
  onOpen,
  onDelete,
}: {
  entry: InboxNotification;
  stale: InboxStaleReason | null;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation('web');
  const tk = t as unknown as (key: string, params?: Record<string, unknown>) => string;
  // Stale overrides unread (D7): a resolved subject needs no attention, read or not.
  const state = stale ? 'stale' : entry.readAt ? 'read' : 'unread';
  // A summary names its first friend, resolved now; the line renders once, final.
  const { displayName: friendName, isResolved: textReady } = useFriendDisplayName(
    entry.action === 'weekly' ? (summaryFriendIds(entry)[0] ?? null) : null,
  );
  const text = inboxText(entry, tk, friendName);
  const ariaLabel = [
    text,
    stale ? tk(`inbox.stale.${stale}`) : state === 'unread' ? t('inbox.state.unread') : null,
  ]
    .filter(Boolean)
    .join(', ');

  // Read once, as the PWA's computed does.
  const [now] = useState(Date.now);
  const seconds = (new Date(entry.createdAt).getTime() - now) / 1000;
  const fmt = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto', style: 'short' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const step = steps.find(([, size]) => Math.abs(seconds) >= size);
  const relativeTime = step
    ? fmt.format(Math.round(seconds / step[1]), step[0])
    : fmt.format(0, 'minute');

  // Swipe-to-delete: horizontal drag only (touch-action: pan-y keeps vertical scroll native).
  // ponytail: hand-rolled, no gesture lib; add one if more swipe surfaces appear.
  const [offset, setOffset] = useState(0);
  const drag = useRef({ startX: null as number | null, dragged: false, offset: 0 }).current;
  function onPointerDown(e: PointerEvent) {
    drag.startX = e.clientX;
    drag.dragged = false;
  }
  function onPointerMove(e: PointerEvent) {
    if (drag.startX === null) return;
    const dx = Math.min(0, e.clientX - drag.startX);
    if (Math.abs(dx) > 6) drag.dragged = true;
    drag.offset = dx;
    setOffset(dx);
  }
  function onPointerUp(e: PointerEvent<HTMLElement>) {
    if (drag.startX === null) return;
    const width = e.currentTarget.offsetWidth || 1;
    const passed = -drag.offset / width >= SWIPE_THRESHOLD;
    drag.startX = null;
    drag.offset = 0;
    setOffset(0);
    if (passed) onDelete();
  }

  return (
    <li className={c('item-wrap')}>
      {/* Revealed under the row while it is swiped away. */}
      {offset !== 0 && (
        <span className={c('swipe-bg')} aria-hidden="true">
          <BaseIcon name="delete" />
        </span>
      )}
      <button
        className={c(`item item--${state}`)}
        style={offset ? { transform: `translateX(${offset}px)`, transition: 'none' } : undefined}
        aria-label={ariaLabel}
        data-testid="inbox-item"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={() => !drag.dragged && onOpen()}
      >
        <span className={c('body')}>
          <span className={c('text')}>{textReady ? text : ' '}</span>
          <span className={c('meta')}>
            <span>{relativeTime}</span>
            {entry.occurrences > 1 && (
              <span className={c('count')}>
                {t('inbox.occurrences', { count: entry.occurrences })}
              </span>
            )}
            {stale && (
              <span className={c('chip')} data-testid="stale-chip">
                <BaseIcon name="history" className={c('chip-icon')} />
                {tk(`inbox.stale.${stale}`)}
              </span>
            )}
          </span>
        </span>
        {state === 'unread' && (
          <span className={c('dot')} data-testid="unread-dot" aria-hidden="true" />
        )}
      </button>
      <BaseIconButton
        className={c('delete')}
        name="delete"
        size="sm"
        tone="danger"
        label={t('inbox.delete')}
        onClick={onDelete}
      />
    </li>
  );
}
