import { useWindowDimensions } from 'react-native';

import { breakpoint } from './tokens';

export type Breakpoint = 'compact' | 'medium' | 'expanded';

export function breakpointFor(width: number): Breakpoint {
  if (width >= breakpoint.expanded) return 'expanded';
  return width >= breakpoint.medium ? 'medium' : 'compact';
}

/** Phone (`compact`), tablet or narrow window (`medium`), desktop (`expanded`). */
export function useBreakpoint(): Breakpoint {
  return breakpointFor(useWindowDimensions().width);
}
