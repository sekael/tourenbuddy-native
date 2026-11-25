import { useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { BottomSheet } from '@/core/web/bottom-sheet.web';
import { classes } from '@/core/web/classes';
import { fadeOut, useExitAnimation } from '@/core/web/use-exit-animation.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { resolveContactName, type Contact } from '@/features/contacts/domain/entities/contact';
import { buildContactActions } from '@/features/contacts/domain/utils/contact-actions';

import styles from './contact-action-menu.module.css';

const c = classes(styles);
const POPOVER_WIDTH = 240;
const MARGIN = 8;

/** A partner's call and WhatsApp links and "edit": a popover on desktop, a sheet on phones. */
export function ContactActionMenu({
  contact,
  anchorRect,
  onClose,
  onEditContact,
}: {
  contact: Contact;
  anchorRect: DOMRect | null;
  onClose: () => void;
  onEditContact: (contactId: string) => void;
}) {
  const { t } = useTranslation('web');
  const isDesktop = useIsDesktop();
  const hostEl = useRef<HTMLDivElement>(null);
  useExitAnimation(hostEl, fadeOut);
  const actions = buildContactActions(contact);
  const contactName = resolveContactName(contact);

  let popoverStyle: CSSProperties = {};
  if (anchorRect) {
    let left = anchorRect.left;
    if (left + POPOVER_WIDTH > window.innerWidth - MARGIN)
      left = window.innerWidth - POPOVER_WIDTH - MARGIN;
    popoverStyle = { top: `${anchorRect.bottom + MARGIN}px`, left: `${left}px` };
  }

  // Close on outside click (desktop).
  const popoverEl = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!isDesktop) return;
    const outside = (e: MouseEvent) => {
      if (popoverEl.current && !popoverEl.current.contains(e.target as Node)) onCloseRef.current();
    };
    document.addEventListener('mousedown', outside, true);
    return () => document.removeEventListener('mousedown', outside, true);
  }, []);

  const methods = (sheet: boolean) =>
    actions.length > 0 ? (
      <>
        {actions.map((action) => (
          <div key={action.methodId} className={c('method-row')}>
            <span className={c('method-label')}>{action.label}</span>
            <div className={c('method-actions')}>
              <a
                href={action.call}
                className={c('menu-action-btn', { 'sheet-action-btn': sheet })}
                {...(sheet ? { 'aria-label': 'Call' } : { title: 'Call', role: 'menuitem' })}
              >
                <BaseIcon name="call" />
              </a>
              <a
                href={action.whatsApp}
                className={c('menu-action-btn', { 'sheet-action-btn': sheet })}
                target="_blank"
                rel="noopener noreferrer"
                {...(sheet
                  ? { 'aria-label': 'WhatsApp' }
                  : { title: 'WhatsApp', role: 'menuitem' })}
              >
                <BaseIcon name="chat" />
              </a>
            </div>
          </div>
        ))}
        <div className={c('menu-divider')} />
      </>
    ) : (
      <p className={c('no-methods-hint')}>{t('contacts.actionMenu.noMethods')}</p>
    );

  return createPortal(
    isDesktop ? (
      <div
        className={c('popover-backdrop')}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <div
          ref={popoverEl}
          className={c('popover')}
          style={popoverStyle}
          role="menu"
          aria-label={`Actions for ${contactName}`}
        >
          <div className={c('popover-header')}>
            <span className={c('popover-name')}>{contactName}</span>
            <BaseIconButton name="close" label="Close" size="sm" onClick={onClose} />
          </div>
          <div className={c('menu-body')}>
            {methods(false)}
            <BaseButton
              variant="text"
              size="sm"
              className={c('edit-row')}
              role="menuitem"
              onClick={() => onEditContact(contact.id)}
            >
              <BaseIcon name="edit" className={c('edit-icon')} />
              {t('contacts.actionMenu.editBtn')}
            </BaseButton>
          </div>
        </div>
      </div>
    ) : (
      <div
        ref={hostEl}
        className="sheet-host sheet-host--modal"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <BottomSheet title={contactName} fitContent onClose={onClose}>
          <div className={c('sheet-body')}>
            {methods(true)}
            <BaseButton
              variant="text"
              size="sm"
              className={c('edit-row sheet-edit-row')}
              onClick={() => onEditContact(contact.id)}
            >
              <BaseIcon name="edit" className={c('edit-icon')} />
              {t('contacts.actionMenu.editBtn')}
            </BaseButton>
          </div>
        </BottomSheet>
      </div>
    ),
    document.body,
  );
}
