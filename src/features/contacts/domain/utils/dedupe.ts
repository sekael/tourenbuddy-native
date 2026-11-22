interface PhoneLike {
  value: string;
  label?: string | null;
  isPrimary: boolean;
}

/** Collapse duplicate phone entries by E.164 `value`. OR-merges `isPrimary`; keeps first non-null `label`. */
export function dedupePhones<T extends PhoneLike>(phones: T[]): T[] {
  const seen = new Map<string, T>();
  for (const phone of phones) {
    const existing = seen.get(phone.value);
    if (existing) {
      seen.set(phone.value, {
        ...existing,
        isPrimary: existing.isPrimary || phone.isPrimary,
        label: existing.label ?? phone.label,
      } as T);
    } else {
      seen.set(phone.value, phone);
    }
  }
  return [...seen.values()];
}

/** Collapse duplicate raw phone strings, case-insensitively after trim. Preserves first-seen casing. */
export function dedupeRawPhones(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      result.push(v);
    }
  }
  return result;
}
