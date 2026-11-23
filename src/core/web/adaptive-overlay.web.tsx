import type { ReactNode } from 'react';

import { BottomSheet } from './bottom-sheet.web';
import { DialogWindow, type OverlayProps } from './dialog-window.web';
import { FullScreenPage } from './full-screen-page.web';
import { useIsDesktop } from './use-media-query.web';

/**
 * The PWA's `<AdaptiveOverlay>`: a bottom sheet on phones (fitting its content unless
 * `fitContent={false}`), a dialog from 600 px, and with `page` a full-screen page on phones for
 * data entry.
 */
export function AdaptiveOverlay({
  fitContent = true,
  page,
  pageAction,
  ...props
}: OverlayProps & { fitContent?: boolean; page?: boolean; pageAction?: ReactNode }) {
  const isDesktop = useIsDesktop();
  if (!isDesktop && page)
    return (
      <FullScreenPage
        title={props.title}
        ariaLabel={props.ariaLabel}
        showBack={props.showBack}
        collapsed={props.collapsed}
        onClose={props.onClose}
        onBack={props.onBack}
        pageAction={pageAction}
      >
        {props.children}
      </FullScreenPage>
    );
  if (!isDesktop) return <BottomSheet {...props} fitContent={fitContent} />;
  return <DialogWindow {...props} />;
}
