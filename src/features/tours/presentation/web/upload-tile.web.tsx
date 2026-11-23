import type { ReactNode } from 'react';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes, join } from '@/core/web/classes';

import styles from './upload-tile.module.css';

const c = classes(styles);

/**
 * The one file tile: icon, filename, optional determinate progress, caller-supplied actions.
 * Presentational only, so both the attachment rows and the GPX row drive it.
 */
export function UploadTile({
  icon,
  filename,
  progress,
  progressLabel,
  failed,
  status,
  className,
  children,
}: {
  icon: string;
  filename: string;
  /** Fraction 0..1 while a transfer is in flight. Omit (or null) to render no bar at all. */
  progress?: number | null;
  progressLabel?: string;
  failed?: boolean;
  status?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={join(c('upload-tile', { 'upload-tile--failed': !!failed }), className)}>
      <BaseIcon name={icon} className={c('upload-tile__icon')} />
      <div className={c('upload-tile__body')}>
        <span className={c('upload-tile__name')}>{filename}</span>
        {/* Native <progress>: determinate, accessible, and free of a hand-rolled bar. */}
        {progress != null && (
          <progress
            className={c('upload-tile__progress')}
            value={progress}
            max={1}
            aria-label={progressLabel}
          />
        )}
        {status}
      </div>
      {children}
    </div>
  );
}
