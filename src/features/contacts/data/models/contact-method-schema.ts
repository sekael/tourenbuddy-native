import { z } from 'zod';

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/** Enum matching Supabase `contact_method_type`. */
export const contactMethodTypeSchema = z.enum(['phone', 'email']);

/** Raw shape from Supabase `contact_methods` table (snake_case). */
export const contactMethodRowSchema = z
  .object({
    id: z.string(),
    contact_id: z.string(),
    method_type: contactMethodTypeSchema,
    value: z.string(),
    label: z.string().nullable(),
    is_primary: z.boolean(),
    is_valid: z.boolean().default(true),
  })
  .transform((row) => ({
    id: row.id,
    contactId: row.contact_id,
    methodType: row.method_type,
    value: row.value,
    label: row.label,
    isPrimary: row.is_primary,
    isValid: row.is_valid,
  }));

/** Domain-level contact method shape (camelCase). */
export const contactMethodSchema = z
  .object({
    id: z.string(),
    contactId: z.string(),
    methodType: contactMethodTypeSchema,
    value: z.string(),
    label: z.string().nullable(),
    isPrimary: z.boolean(),
    isValid: z.boolean().default(true),
  })
  .superRefine((method, ctx) => {
    if (method.methodType === 'phone' && method.isValid && !E164_REGEX.test(method.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Phone value must be in E.164 format when isValid is true',
        path: ['value'],
      });
    }
  });
