import { BaseIcon } from '@/core/web/base-icon.web';
import { classes, join } from '@/core/web/classes';
import { useIsDesktop } from '@/core/web/use-media-query.web';

import styles from './speed-dial-trigger.module.css';

const c = classes(styles);

/** The menu's round trigger: menu ⇄ close icon, the inbox count or an attention dot. */
export function SpeedDialTrigger({
  isOpen,
  count,
  dot,
  titleOpen,
  titleClosed,
  className,
  onToggle,
}: {
  isOpen: boolean;
  count?: number;
  dot?: boolean;
  titleOpen: string;
  titleClosed: string;
  className?: string;
  onToggle: () => void;
}) {
  const isDesktop = useIsDesktop();
  return (
    <div className={join(c('wrap'), className)}>
      <button
        type="button"
        className={c('fab fab-glass', { open: isOpen })}
        data-tour="open-menu"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls="speed-dial-menu"
        title={isDesktop ? (isOpen ? titleOpen : titleClosed) : undefined}
        onClick={onToggle}
      >
        <BaseIcon name="menu" className={c('icon icon-menu', { hidden: isOpen })} />
        <BaseIcon name="close" className={c('icon icon-close', { hidden: !isOpen })} />
      </button>
      {count && !isOpen ? (
        <span className={c('count')} data-testid="trigger-count" aria-hidden="true">
          {count > 9 ? '9+' : count}
        </span>
      ) : dot && !isOpen ? (
        <span className={c('dot')} data-testid="trigger-dot" aria-hidden="true" />
      ) : null}
    </div>
  );
}
