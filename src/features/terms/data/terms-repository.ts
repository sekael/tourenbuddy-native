import { z } from 'zod';

import { supabase } from '@/core/supabase';

import type { TermsStatus } from '../domain/terms';

const statusSchema = z.object({
  current_version: z.string(),
  accepted_version: z.string().nullable(),
});

function toStatus(rows: unknown): TermsStatus {
  const row = statusSchema.parse(Array.isArray(rows) ? rows[0] : rows);
  return { current: row.current_version, accepted: row.accepted_version };
}

/** The version in force and the signed-in user's latest accepted one. */
export async function fetchTermsStatus(): Promise<TermsStatus> {
  const { data, error } = await supabase.rpc('terms_status');
  if (error) throw new Error(error.message);
  return toStatus(data);
}

/** Records the acceptance on the server (its time, the account's email); only the version in force. */
export async function acceptTerms(version: string): Promise<TermsStatus> {
  const { data, error } = await supabase.rpc('accept_terms', { p_version: version });
  if (error) throw new Error(error.message);
  return toStatus(data);
}
