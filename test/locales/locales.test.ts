import deCH from '@/locales/de-CH.json';
import en from '@/locales/en.json';

type Catalog = { [key: string]: string | Catalog };

function flatten(catalog: Catalog, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(catalog)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [nk, nv] of flatten(v, key)) out.set(nk, nv);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

// vue-i18n leftovers: pipe plurals, single-brace placeholders, {'…'} literal escapes.
const VUE_SYNTAX = /\||(?<!\{)\{\w+\}(?!\})|\{'/;

function localeProblems(source: Catalog, target: Catalog): string[] {
  const src = flatten(source);
  const tgt = flatten(target);
  const problems: string[] = [];
  for (const key of src.keys()) if (!tgt.has(key)) problems.push(`missing: ${key}`);
  for (const [key, text] of tgt) {
    if (!src.has(key)) problems.push(`extra: ${key}`);
    else if (placeholders(text).join() !== placeholders(src.get(key)!).join())
      problems.push(`placeholders: ${key}`);
  }
  for (const [key, text] of [...src, ...tgt])
    if (VUE_SYNTAX.test(text)) problems.push(`vue syntax: ${key}`);
  return problems;
}

describe('locale catalogs', () => {
  it('should have the same keys, placeholders and no vue-i18n syntax', () => {
    expect(localeProblems(en, deCH)).toEqual([]);
  });

  it('should report a key missing from the translation', () => {
    expect(localeProblems({ a: { b: 'x' } }, { a: {} })).toEqual(['missing: a.b']);
  });

  it('should report a key only the translation has', () => {
    expect(localeProblems({}, { extra: 'x' })).toEqual(['extra: extra']);
  });

  it('should report renamed placeholders', () => {
    expect(localeProblems({ k: '{{count}} days' }, { k: '{{anzahl}} Tage' })).toEqual([
      'placeholders: k',
    ]);
  });

  it('should report leftover vue-i18n syntax in either catalog', () => {
    expect(localeProblems({ p: '{count} day | {count} days' }, { p: "du{'@'}example.ch" })).toEqual(
      ['vue syntax: p', 'vue syntax: p'],
    );
  });
});
