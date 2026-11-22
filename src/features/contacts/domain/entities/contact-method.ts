import type { z } from 'zod';
import type { contactMethodSchema } from '@/features/contacts/data/models/contact-method-schema';

/** Domain entity for a contact communication method (phone, email, etc.). */
export type ContactMethod = z.infer<typeof contactMethodSchema>;
