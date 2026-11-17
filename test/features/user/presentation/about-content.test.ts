import { readFileSync } from 'fs';
import { join } from 'path';

import deCH from '@/locales/de-CH.json';
import en from '@/locales/en.json';

/**
 * The «Über» pages show the website's legal text inside the app (`public/<lang>/<page>`). Both say
 * the same: a changed sentence on one side fails here until the other follows.
 */
type Doc = {
  title: string;
  updated: string;
  sections: { title?: string; rows: { label?: string; text: string; country?: string }[] }[];
};

const pageText = (path: string) =>
  readFileSync(join(__dirname, '../../../../public', path, 'index.html'), 'utf8')
    // Blocks apart, inline tags (links, bold) gone without a trace.
    .replace(/<br>|<\/(?:p|li|td|th|h1|h2)>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const strings = (doc: Doc) => [
  doc.title,
  doc.updated,
  ...doc.sections.flatMap((s) => [
    ...(s.title ? [s.title] : []),
    ...s.rows.flatMap((r) => [r.label, r.text, r.country].filter((x): x is string => !!x)),
  ]),
];

describe.each([
  ['en', en.about, ''],
  ['de-CH', deCH.about, 'de/'],
] as const)('About pages (%s)', (_, about, prefix) => {
  it.each(['privacy', 'terms', 'imprint'] as const)(
    'should say on %s what the website says',
    (name) => {
      const html = pageText(`${prefix}${name}`);
      const missing = strings(about[name] as unknown as Doc).filter(
        (text) => !html.includes(text.replace(/\s+/g, ' ')),
      );
      expect(missing).toEqual([]);
    },
  );
});
