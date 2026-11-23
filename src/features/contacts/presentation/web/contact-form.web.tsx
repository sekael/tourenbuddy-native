import { useImperativeHandle, useState, type ChangeEvent, type Ref } from 'react';
import { useTranslation } from 'react-i18next';

import { normalizePhone } from '@/core/utils/phone-normalize';
import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { BaseTooltip } from '@/core/web/base-tooltip.web';
import { classes } from '@/core/web/classes';
import { useAsYouTypePhone } from '@/core/web/use-as-you-type-phone.web';
import type { PhoneEntry } from '@/features/contacts/presentation/stores/contacts-store';

import styles from './contact-form.module.css';

const c = classes(styles);

type PhoneRow = {
  id: string;
  value: string;
  label: string;
  isPrimary: boolean;
  error: string | null;
};

export type ContactFormData = {
  firstName: string;
  lastName: string | null;
  displayName: string | null;
  phones: PhoneEntry[];
};

export type ContactFormHandle = {
  submit: () => void;
  /** Validates and returns the data; throws (and shows the error) when invalid. */
  validateAndCollect: () => ContactFormData;
};

const newRow = (isPrimary: boolean): PhoneRow => ({
  id: crypto.randomUUID(),
  value: '',
  label: '',
  isPrimary,
  error: null,
});

/** One phone input, formatted as you type (its own hook per row). */
function PhoneInput({
  value,
  error,
  placeholder,
  onChange,
}: {
  value: string;
  error: boolean;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  const phone = useAsYouTypePhone(value, onChange);
  return (
    <input
      value={phone.formatted}
      className={c('input', { 'input--error': error })}
      type="tel"
      placeholder={placeholder}
      onChange={(e: ChangeEvent<HTMLInputElement>) => phone.onInput(e)}
    />
  );
}

/** A new contact: names and any number of phones, one of them primary. */
export function ContactForm({
  submitLabel = '',
  isLoading = false,
  formId,
  embedded,
  ref,
  onSubmit,
  onCancel,
  onPhoneChange,
}: {
  submitLabel?: string;
  isLoading?: boolean;
  /** `<form>` id, so an external Save button can submit via the `form` attribute. */
  formId?: string;
  /** Hide the in-form cancel/save row (a full-screen page's top bar provides them). */
  embedded?: boolean;
  ref?: Ref<ContactFormHandle>;
  onSubmit: (data: ContactFormData) => void;
  onCancel: () => void;
  onPhoneChange?: (phone: string) => void;
}) {
  const { t } = useTranslation('web');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneRows, setPhoneRows] = useState<PhoneRow[]>(() => [newRow(true)]);
  const [error, setError] = useState<string | null>(null);

  const patchRow = (id: string, patch: Partial<PhoneRow>) =>
    setPhoneRows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  function removePhoneRow(index: number) {
    setPhoneRows((rows) => {
      const next = rows.filter((_, i) => i !== index);
      if (rows[index]?.isPrimary && next.length > 0) next[0] = { ...next[0]!, isPrimary: true };
      return next;
    });
  }

  function validateAndCollect(): ContactFormData {
    setError(null);
    const fail = (message: string) => {
      setError(message);
      throw new Error(message);
    };
    if (!firstName.trim()) fail(t('contacts.form.firstNameRequired'));

    const checked = phoneRows.map((r) =>
      r.value.trim()
        ? {
            ...r,
            error: normalizePhone(r.value.trim()).ok ? null : t('contacts.form.invalidPhone'),
          }
        : r,
    );
    setPhoneRows(checked);
    const nonEmpty = checked.filter((r) => r.value.trim());
    if (nonEmpty.some((r) => r.error)) throw new Error(t('contacts.form.invalidPhone'));
    if (nonEmpty.length > 1 && nonEmpty.filter((r) => r.isPrimary).length !== 1)
      fail(t('contacts.form.primaryPhoneRequired'));

    return {
      firstName: firstName.trim(),
      lastName: lastName.trim() || null,
      displayName: displayName.trim() || null,
      phones: nonEmpty.map((row) => {
        const result = normalizePhone(row.value.trim());
        return {
          value: result.ok ? result.e164 : row.value.trim(),
          label: row.label.trim() || null,
          isPrimary: nonEmpty.length === 1 ? true : row.isPrimary,
        };
      }),
    };
  }

  function submit() {
    let data: ContactFormData;
    try {
      data = validateAndCollect();
    } catch {
      return; // the form shows why
    }
    onSubmit(data);
  }

  useImperativeHandle(ref, () => ({ submit, validateAndCollect }));

  const nameField = (
    id: string,
    label: string,
    placeholder: string,
    value: string,
    set: (v: string) => void,
    required = false,
  ) => (
    <div className={c('field')}>
      <label className={c('label')} htmlFor={id}>
        {label} {required && <span className={c('required')}>*</span>}
      </label>
      <input
        id={id}
        value={value}
        className={c('input')}
        type="text"
        maxLength={50}
        placeholder={placeholder}
        required={required}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );

  return (
    <form
      id={formId}
      className={c('form')}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {nameField(
        'cf-firstName',
        t('contacts.form.firstNameLabel'),
        t('contacts.form.firstNamePlaceholder'),
        firstName,
        setFirstName,
        true,
      )}
      {nameField(
        'cf-lastName',
        t('contacts.form.lastNameLabel'),
        t('contacts.form.lastNamePlaceholder'),
        lastName,
        setLastName,
      )}
      {nameField(
        'cf-displayName',
        t('contacts.form.displayNameLabel'),
        t('contacts.form.displayNamePlaceholder'),
        displayName,
        setDisplayName,
      )}

      <div className={c('phones-section')}>
        <div className={c('phones-header')}>
          <span className={c('label')}>{t('contacts.form.phonesLabel')}</span>
        </div>
        {phoneRows.map((row, i) => (
          <div key={row.id} className={c('phone-row')}>
            <button
              type="button"
              className={c('primary-star', { 'primary-star--selected': row.isPrimary })}
              onClick={() =>
                setPhoneRows((rows) => rows.map((r, j) => ({ ...r, isPrimary: j === i })))
              }
            >
              <BaseTooltip
                text={
                  row.isPrimary
                    ? t('contacts.form.primaryPhoneTooltip')
                    : t('contacts.form.setAsPrimaryTooltip')
                }
              >
                <BaseIcon name={row.isPrimary ? 'star_filled' : 'star'} />
              </BaseTooltip>
            </button>
            <div className={c('phone-inputs')}>
              <PhoneInput
                value={row.value}
                error={!!row.error}
                placeholder={t('contacts.form.phonePlaceholder')}
                onChange={(value) => {
                  patchRow(row.id, { value });
                  onPhoneChange?.(value);
                }}
              />
              {row.error && <p className={c('error-text')}>{row.error}</p>}
              <input
                value={row.label}
                className={c('input input-sm')}
                type="text"
                placeholder={t('contacts.form.labelPlaceholder')}
                onChange={(e) => patchRow(row.id, { label: e.target.value })}
              />
            </div>
            {phoneRows.length > 1 && (
              <BaseIconButton
                name="remove_circle_outline"
                label={t('contacts.form.removePhoneTooltip')}
                size="sm"
                tone="danger"
                className={c('remove-phone-btn')}
                onClick={() => removePhoneRow(i)}
              />
            )}
          </div>
        ))}
        <BaseButton
          variant="text"
          size="sm"
          className={c('add-phone-btn')}
          onClick={() => setPhoneRows((rows) => [...rows, newRow(false)])}
        >
          <BaseIcon name="add" />
          {t('contacts.form.addPhoneBtn')}
        </BaseButton>
      </div>

      {error && <p className={c('error-text')}>{error}</p>}

      {!embedded && (
        <div className={c('actions')}>
          <BaseButton type="button" variant="secondary" onClick={onCancel}>
            {t('contacts.shared.cancelBtn')}
          </BaseButton>
          <BaseButton type="submit" variant="primary" disabled={isLoading}>
            {isLoading ? t('contacts.shared.savingBtn') : submitLabel || t('user.shared.saveBtn')}
          </BaseButton>
        </div>
      )}
    </form>
  );
}
