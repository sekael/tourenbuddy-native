import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const MARK = '\u0001';

/**
 * vue-i18n's `<i18n-t>`: a message whose `{{name}}` placeholders are React nodes (links, bold
 * text), rendered in a `tag` with the given class.
 */
export function I18nT({
  keypath,
  slots,
  tag: Tag = 'span',
  className,
}: {
  keypath: string;
  slots: Record<string, ReactNode>;
  tag?: 'p' | 'span' | 'div';
  className?: string;
}) {
  const { t } = useTranslation('web');
  const marked = t(
    keypath as never,
    Object.fromEntries(Object.keys(slots).map((n) => [n, `${MARK}${n}${MARK}`])),
  );
  const parts = String(marked).split(MARK);
  return (
    <Tag className={className}>
      {parts.map((part, i) => (
        <Fragment key={i}>{i % 2 === 1 ? slots[part] : part}</Fragment>
      ))}
    </Tag>
  );
}
