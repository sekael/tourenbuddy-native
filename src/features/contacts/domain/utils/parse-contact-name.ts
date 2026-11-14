export interface ParsedName {
  firstName: string;
  lastName: string | null;
}

/** Splits a full name string into firstName and lastName components. */
export function parseContactName(fullName: string): ParsedName {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return { firstName: fullName.trim(), lastName: null };

  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;

  return { firstName, lastName };
}
