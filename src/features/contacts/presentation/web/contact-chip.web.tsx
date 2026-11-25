import type { MouseEvent } from 'react';

import { BaseIcon } from '@/core/web/base-icon.web';
import { classes, join } from '@/core/web/classes';
import { resolveContactName, type Contact } from '@/features/contacts/domain/entities/contact';

import styles from './contact-chip.module.css';

const c = classes(styles);

export function ContactChip({
  contact,
  selected,
  mode = 'select',
  className,
  onToggle,
  onOpen,
  ...rest
}: {
  contact: Contact;
  selected: boolean;
  mode?: 'select' | 'action';
  className?: string;
  onToggle?: (contactId: string) => void;
  onOpen?: (contactId: string, rect: DOMRect) => void;
  'data-initial'?: string;
}) {
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (mode === 'action') onOpen?.(contact.id, event.currentTarget.getBoundingClientRect());
    else onToggle?.(contact.id);
  }
  return (
    <button
      className={join(c('chip', { selected }), className)}
      type="button"
      onClick={handleClick}
      {...rest}
    >
      {selected && mode === 'select' && <BaseIcon name="check" className={c('check-icon')} />}
      {resolveContactName(contact)}
    </button>
  );
}
