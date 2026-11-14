import { VCardImportError } from '@/core/exceptions';
import { normalizePhone } from '@/core/utils/phone-normalize';

import { dedupePhones, dedupeRawPhones } from './dedupe';
import { parseContactName, type ParsedName } from './parse-contact-name';

export interface VCardPhone {
  value: string;
  label: string | null;
  isPrimary: boolean;
}

export interface VCardContact extends ParsedName {
  phones: VCardPhone[];
  rawPhoneNumbers: string[];
}

/** Name given to a card carrying neither N nor FN. Not a name — a marker that one is missing. */
export const UNNAMED_CONTACT = 'Unknown';

function parseTelTypes(params: string): string[] {
  const seen = new Set<string>();
  for (const match of params.matchAll(/TYPE=([^;:\r\n]+)/gi)) {
    for (const t of match[1]!.split(',')) {
      const upper = t.trim().toUpperCase();
      // iOS exports TYPE=iPhone (without TYPE=CELL) — treat as CELL
      seen.add(upper === 'IPHONE' ? 'CELL' : upper);
    }
  }
  return [...seen];
}

function deriveTelLabel(types: string[]): string | null {
  const known = types.filter((t) =>
    ['CELL', 'HOME', 'WORK', 'VOICE', 'FAX', 'PAGER', 'PREF', 'OTHER'].includes(t),
  );
  const relevant = known.filter((t) => t !== 'VOICE' && t !== 'PREF');
  if (relevant.length === 0) return null;
  const display = relevant
    .map((t) => {
      if (t === 'CELL') return 'Mobile';
      if (t === 'HOME') return 'Home';
      if (t === 'WORK') return 'Work';
      return null;
    })
    .filter(Boolean) as string[];
  return display.length > 0 ? display.join('/') : null;
}

function parsePrefValue(params: string): number | null {
  const v4Match = params.match(/(?:^|;)PREF=(\d+)/i);
  if (v4Match) return Number.parseInt(v4Match[1]!, 10);
  return null;
}

function hasPrefV3(types: string[]): boolean {
  return types.includes('PREF');
}

/**
 * Parses vCard 3.0/4.0 format text into structured contacts.
 * Exported for unit testing.
 */
export function parseVCardText(text: string): VCardContact[] {
  const blocks = text.split(/BEGIN:VCARD/i).slice(1);
  return blocks.map((block) => {
    const end = block.indexOf('END:VCARD');
    const content = end !== -1 ? block.slice(0, end) : block;

    // Extract name: prefer structured N field then FN
    const nMatch = content.match(/^N(?:;[^:]*)?:([^\r\n]*)/im);
    const fnMatch = content.match(/^FN(?:;[^:]*)?:([^\r\n]*)/im);

    let firstName = '';
    let lastName: string | null = null;

    if (nMatch?.[1]) {
      const parts = nMatch[1].split(';');
      const lastPart = parts[0]?.trim() ?? '';
      const firstPart = parts[1]?.trim() ?? '';
      if (firstPart) {
        firstName = firstPart;
        lastName = lastPart || null;
      } else if (lastPart) {
        const parsed = parseContactName(lastPart);
        firstName = parsed.firstName;
        lastName = parsed.lastName;
      }
    }

    if (!firstName && fnMatch?.[1]) {
      const parsed = parseContactName(fnMatch[1].trim());
      firstName = parsed.firstName;
      lastName = parsed.lastName;
    }

    // Extract all TEL entries
    interface RawPhone {
      rawValue: string;
      params: string;
      types: string[];
      prefV4: number | null;
      hasPrefV3: boolean;
    }

    const rawPhones: RawPhone[] = [];
    for (const m of content.matchAll(/^(TEL(?:;[^:]*)?):([^\r\n]*)/gim)) {
      const paramStr = m[1]!;
      const rawValue = m[2]!.trim();
      const types = parseTelTypes(paramStr);
      rawPhones.push({
        rawValue,
        params: paramStr,
        types,
        prefV4: parsePrefValue(paramStr),
        hasPrefV3: hasPrefV3(types),
      });
    }

    if (rawPhones.length === 0)
      return { firstName: firstName || UNNAMED_CONTACT, lastName, phones: [], rawPhoneNumbers: [] };

    // Normalize phones; route unparseable values to rawPhoneNumbers only.
    //
    // `isPrimary` is carried only to satisfy `dedupePhones`' `PhoneLike` constraint.
    // Without it the generic cannot bind to `ParsedPhone` and silently widens to
    // `PhoneLike`, which drops every vCard-specific field below. It stays `false`
    // here: the real primary is resolved after deduping, from PREF then type
    // priority, so `dedupePhones`' OR-merge of the flag is a deliberate no-op.
    interface ParsedPhone {
      value: string;
      label: string | null;
      isPrimary: boolean;
      originalIndex: number;
      prefV4: number | null;
      hasPrefV3: boolean;
      types: string[];
    }

    const parsedPhones: ParsedPhone[] = [];
    const rawPhoneNumbers: string[] = [];

    for (let i = 0; i < rawPhones.length; i++) {
      const p = rawPhones[i]!;
      const normalized = normalizePhone(p.rawValue);
      if (normalized.ok) {
        parsedPhones.push({
          value: normalized.e164,
          label: deriveTelLabel(p.types),
          isPrimary: false,
          originalIndex: i,
          prefV4: p.prefV4,
          hasPrefV3: p.hasPrefV3,
          types: p.types,
        });
      } else if (p.rawValue) {
        rawPhoneNumbers.push(p.rawValue);
      }
    }

    // Dedupe before primary-resolution so PREF/CELL/HOME/WORK runs on a unique set
    const dedupedPhones = dedupePhones(parsedPhones);
    const dedupedRaw = dedupeRawPhones(rawPhoneNumbers);

    if (dedupedPhones.length === 0)
      return {
        firstName: firstName || UNNAMED_CONTACT,
        lastName,
        phones: [],
        rawPhoneNumbers: dedupedRaw,
      };

    // Determine primary using PREF markers then type priority
    const v4PrefCandidates = dedupedPhones
      .filter((p) => p.prefV4 !== null)
      .sort((a, b) => a.prefV4! - b.prefV4!);
    const v3PrefIdx = dedupedPhones.findIndex((p) => p.hasPrefV3);

    let primaryParsedIdx = -1;
    if (v4PrefCandidates.length > 0) {
      primaryParsedIdx = dedupedPhones.indexOf(v4PrefCandidates[0]!);
    } else if (v3PrefIdx !== -1) {
      primaryParsedIdx = v3PrefIdx;
    }

    if (primaryParsedIdx === -1) {
      const cellIdx = dedupedPhones.findIndex((p) => p.types.includes('CELL'));
      if (cellIdx !== -1) primaryParsedIdx = cellIdx;
    }
    if (primaryParsedIdx === -1) {
      const homeIdx = dedupedPhones.findIndex((p) => p.types.includes('HOME'));
      if (homeIdx !== -1) primaryParsedIdx = homeIdx;
    }
    if (primaryParsedIdx === -1) {
      const workIdx = dedupedPhones.findIndex((p) => p.types.includes('WORK'));
      if (workIdx !== -1) primaryParsedIdx = workIdx;
    }
    if (primaryParsedIdx === -1) primaryParsedIdx = 0;

    const phones: VCardPhone[] = dedupedPhones.map((p, i) => ({
      value: p.value,
      label: p.label,
      isPrimary: i === primaryParsedIdx,
    }));

    return {
      firstName: firstName || UNNAMED_CONTACT,
      lastName,
      phones,
      rawPhoneNumbers: dedupedRaw,
    };
  });
}

/** A card carrying no name, no usable phone and no unusable one either — nothing to import. */
function isEmptyCard(contact: VCardContact): boolean {
  return (
    contact.firstName === UNNAMED_CONTACT &&
    contact.phones.length === 0 &&
    contact.rawPhoneNumbers.length === 0
  );
}

/**
 * Reads a picked .vcf file's text (contact-import): an empty export, a file that is not a vCard
 * and one that holds no usable contact each fail with their own reason. The marker check reads
 * the content, so a valid card saved as .txt still imports.
 */
export function parseVCard(text: string): VCardContact[] {
  if (!text.trim()) throw new VCardImportError('emptyFile');
  if (!/BEGIN:VCARD/i.test(text)) throw new VCardImportError('notVCard');
  const contacts = parseVCardText(text);
  if (contacts.every(isEmptyCard)) throw new VCardImportError('noContacts');
  return contacts;
}
