/** A Vue-style class binding: names, `{ name: condition }` objects, arrays, falsy values. */
export type ClassValue =
  string | false | null | undefined | 0 | Record<string, unknown> | ClassValue[];

/**
 * Class names for a component's CSS Module, as Vue's scoped styles gave them (D2): each name a
 * module defines gets its scoped class plus the plain name, so the component's own rules, the global
 * theme, a parent's `:global()` (Vue's `:deep()`) and selectors in scripts all match as in the PWA.
 * Names the module doesn't define stay plain (global classes).
 */
export function classes(styles: Readonly<Record<string, string>>) {
  const map = (name: string) => (styles[name] ? `${styles[name]} ${name}` : name);
  const collect = (value: ClassValue, out: string[]) => {
    if (!value) return;
    if (typeof value === 'string') value.split(/\s+/).forEach((n) => n && out.push(map(n)));
    else if (Array.isArray(value)) value.forEach((v) => collect(v, out));
    else for (const [name, on] of Object.entries(value)) if (on) out.push(map(name));
  };
  return (...values: ClassValue[]) => {
    const out: string[] = [];
    collect(values, out);
    return out.join(' ');
  };
}

/** Joins class strings, skipping empty ones (a parent's `className` on a child's root). */
export const join = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(' ');
