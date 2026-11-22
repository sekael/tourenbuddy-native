import { z } from 'zod';
import { contactMethodRowSchema, contactMethodSchema } from './contact-method-schema';

/** Raw shape from Supabase `contacts` table with joined `contact_methods` (snake_case). */
export const contactRowSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    first_name: z.string(),
    last_name: z.string().nullable(),
    display_name: z.string().nullable(),
    contact_methods: z.array(contactMethodRowSchema).default([]),
    updated_at: z.string().nullable().default(null),
  })
  .transform((row) => ({
    id: row.id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    contactMethods: row.contact_methods,
    updatedAt: row.updated_at,
  }));

/** Domain-level contact shape (camelCase). */
export const contactSchema = z.object({
  id: z.string(),
  userId: z.string(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  displayName: z.string().nullable(),
  contactMethods: z.array(contactMethodSchema).default([]),
  /** Server-stamped `updated_at` — the LWW baseline for offline write replay (DC5). Null offline-optimistic. */
  updatedAt: z.string().nullable().default(null),
});
