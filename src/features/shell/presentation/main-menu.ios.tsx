import type { ShellTab } from './use-main-menu-items';

/** iOS: the menu is the circle in the tabs' glass dock (`(tabs)/_layout.ios.tsx`), not per screen. */
export function MainMenu(_: { tab: ShellTab }) {
  return null;
}
