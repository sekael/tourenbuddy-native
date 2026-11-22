import { z } from 'zod';

/** Per-tour visibility. `private` = owner-only; `friends` = readable by accepted friends. */
export const visibilitySchema = z.enum(['private', 'friends']);

export type Visibility = z.infer<typeof visibilitySchema>;

export const DEFAULT_VISIBILITY: Visibility = 'friends';
