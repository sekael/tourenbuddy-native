import { z } from 'zod';

// Unset CI secrets still echo `KEY=` lines; an empty value counts as missing.
const required = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);

const schema = z.object({
  EXPO_PUBLIC_SUPABASE_URL: required(z.url({ protocol: /^https?$/ })),
  EXPO_PUBLIC_SUPABASE_ANON_KEY: required(z.string().min(1)),
});

export type Env = z.infer<typeof schema>;

/** Validates the environment; throws naming every missing or malformed variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Missing or invalid environment variables: ${names} (see README, "Backend")`);
  }
  return result.data;
}

/**
 * The validated environment: the only way app code reads it. Expo inlines `EXPO_PUBLIC_*` only
 * for literal `process.env.EXPO_PUBLIC_X` reads, so each variable is named here.
 */
export const env = parseEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
});
