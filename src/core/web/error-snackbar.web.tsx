import styles from './error-snackbar.module.css';
import { BaseIcon } from './base-icon.web';
import { classes } from './classes';
import { Transition } from './transition.web';

const c = classes(styles);

/** The PWA's `<ErrorSnackbar>`: a bottom message, an error or (`info`) a neutral hint. */
export function ErrorSnackbar({
  message,
  visible,
  info,
  onDismiss,
}: {
  message: string;
  visible: boolean;
  info?: boolean;
  onDismiss?: () => void;
}) {
  return (
    <Transition name="snackbar" cls={c}>
      {visible && (
        <div className={c('snackbar', info ? 'info' : 'error')} role={info ? 'status' : 'alert'}>
          <span className={c('message')}>{message}</span>
          <button type="button" className={c('dismiss-btn')} onClick={onDismiss}>
            <BaseIcon name="close" size="sm" />
          </button>
        </div>
      )}
    </Transition>
  );
}
