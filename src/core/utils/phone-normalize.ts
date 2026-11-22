import type { CountryCode } from 'libphonenumber-js/min';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

const DEFAULT_REGION: CountryCode = 'CH';

export type PhoneNormalizeResult = { ok: true; e164: string } | { ok: false; raw: string };

/**
 * Parses a phone number string against the given default region (default: CH).
 *
 * Returns `{ ok: true, e164 }` with the canonical E.164 form (e.g. "+41791234567")
 * or `{ ok: false, raw }` when the input cannot be parsed or is empty.
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_REGION,
): PhoneNormalizeResult {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return { ok: false, raw: '' };

  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) return { ok: false, raw: trimmed };

  return { ok: true, e164: parsed.format('E.164') };
}

/**
 * Formats an E.164 phone number for human-readable display (e.g. "+41 79 123 45 67").
 * Returns the input as-is if it cannot be parsed.
 */
export function formatPhoneForDisplay(
  input: string | null | undefined,
  defaultCountry: CountryCode = DEFAULT_REGION,
): string {
  if (!input) return '';
  const trimmed = input.trim();
  const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed || !parsed.isValid()) return trimmed;
  return parsed.formatInternational();
}
