import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import { useFormatter } from '@/core/web/use-formatter.web';
import { TOUR_TYPE_I18N_KEYS, type TourType } from '@/features/tours/data/models/tour-type';
import type { TourSuggestion } from '@/features/tours/domain/entities/tour-suggestion';
import { useTourAttachmentsStore } from '@/features/tours/presentation/stores/tour-attachments-store';

import styles from './tour-suggestion-row.module.css';

const c = classes(styles);

export function TourSuggestionRow({
  suggestion,
  mode,
  capFull,
  capRelief,
  busy,
  onAccept,
  onDecline,
  onWithdraw,
}: {
  suggestion: TourSuggestion;
  /** Owner adjudicates; the author may only withdraw their own proposal (design D12). */
  mode: 'owner' | 'author';
  /** True when the tour already holds the maximum attachments (D10). */
  capFull?: boolean;
  /** Whether accepting the WHOLE batch still lands under the cap (the hint may point at it). */
  capRelief?: boolean;
  busy?: boolean;
  onAccept?: (s: TourSuggestion) => void;
  onDecline?: (s: TourSuggestion) => void;
  onWithdraw?: (s: TourSuggestion) => void;
}) {
  const { t, i18n } = useTranslation('web');
  const tk = t as unknown as (key: string, params?: Record<string, unknown>) => string;
  const { formatElevation } = useFormatter();
  const attachments = useTourAttachmentsStore((s) => s.attachmentsByTour[suggestion.tourId]) ?? [];

  const label = tk(`tours.suggestions.fields.${suggestion.field}`);
  const isPending = suggestion.status === 'pending';
  const stale = suggestion.isStale && isPending;
  /** An add on a full tour can't be applied alone; accept-all applies removes first (D10). */
  const capBlocked = !!capFull && suggestion.field === 'attachment_add' && isPending;

  /** Enumerated fields show their display names, never the raw token. */
  function localizedEnum(value: unknown): string | null {
    const names = (types: unknown[]) =>
      types.map((v) => tk(`tours.type.${TOUR_TYPE_I18N_KEYS[v as TourType]}`)).join(', ');
    if (suggestion.field === 'tour_type' && Array.isArray(value))
      return value.length ? names(value) : t('tours.suggestions.emptyValue');
    // With legs (activity-legs D6): "↑ Hiking ↓ Paragliding", like the stage cards.
    if (suggestion.field === 'tour_type' && value && typeof value === 'object') {
      const { types, ascent, descent } = value as {
        types: unknown[];
        ascent?: unknown[];
        descent?: unknown[];
      };
      if (ascent && descent && ascent.join() !== descent.join())
        return `↑ ${names(ascent)} ↓ ${names(descent)}`;
      return types.length ? names(types) : t('tours.suggestions.emptyValue');
    }
    if (suggestion.field === 'seasons' && Array.isArray(value))
      return value.map((s) => tk(`tours.season.${s}`)).join(', ');
    return null;
  }

  /** An `attachment_remove` target's name, resolved against the owner's loaded attachments. */
  const removedAttachmentName =
    attachments.find((a) => a.id === suggestion.targetId)?.originalFilename ??
    t('tours.suggestions.anAttachment');

  /** Binary fields describe themselves, not their storage (no UUID in the UI). */
  function binaryLabel(value: unknown, isSuggested: boolean): string | null {
    if (suggestion.field === 'gpx') {
      if (value === null || value === undefined) return t('tours.suggestions.emptyValue');
      return isSuggested ? t('tours.suggestions.gpxNew') : t('tours.suggestions.gpxExisting');
    }
    if (suggestion.field === 'attachment_remove')
      return isSuggested ? t('tours.suggestions.emptyValue') : removedAttachmentName;
    return null;
  }

  function formatDate(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? iso
      : date.toLocaleDateString(i18n.language, {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
  }

  function formatValue(value: unknown, isSuggested = false): string {
    const binary = binaryLabel(value, isSuggested);
    if (binary !== null) return binary;
    if (value === null || value === undefined) return t('tours.suggestions.emptyValue');
    const enumLabel = localizedEnum(value);
    if (enumLabel !== null) return enumLabel;
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.join(', ');
    const obj = value as Record<string, unknown>;
    if ('plannedDate' in obj) {
      const from = obj.plannedDate ? formatDate(String(obj.plannedDate)) : null;
      const to = obj.endDate ? formatDate(String(obj.endDate)) : null;
      if (!from) return t('tours.suggestions.emptyValue');
      const day = typeof obj.startTime === 'string' ? `${from} · ${obj.startTime}` : from;
      return to ? `${day} – ${to}` : day;
    }
    if ('lng' in obj && 'lat' in obj) {
      const coords = `${Number(obj.lat).toFixed(4)}°N, ${Number(obj.lng).toFixed(4)}°E`;
      const name = typeof obj.name === 'string' && obj.name ? `${obj.name} · ` : '';
      const elevation = obj.elevation != null ? ` · ${formatElevation(Number(obj.elevation))}` : '';
      return `${name}${coords}${elevation}`;
    }
    if ('originalFilename' in obj) return String(obj.originalFilename);
    if ('storagePath' in obj) return String(obj.storagePath).split('/').pop() ?? '';
    return JSON.stringify(value);
  }

  return (
    <div className={c('row', { 'row--stale': stale })}>
      <div className={c('row-head')}>
        <span className={c('row-label')}>{label}</span>
        {stale ? (
          <span className={c('stale-badge')}>
            <BaseIcon name="warning" />
            {t('tours.suggestions.stale')}
          </span>
        ) : !isPending ? (
          <span className={c(`status-badge status-badge--${suggestion.status}`)}>
            {tk(`tours.suggestions.status.${suggestion.status}`)}
          </span>
        ) : null}
      </div>

      {/* Stale rows render three columns (design D4): accepting overwrites the owner's own
          newer value, made with the divergence on screen. */}
      <div className={c('values', { 'values--triple': stale })}>
        {stale && (
          <div className={c('value-col')}>
            <span className={c('value-label')}>{t('tours.suggestions.currentValue')}</span>
            <span className={c('value')}>{formatValue(suggestion.currentValue)}</span>
          </div>
        )}
        <div className={c('value-col')}>
          <span className={c('value-label')}>
            {stale ? t('tours.suggestions.baseValue') : t('tours.suggestions.originalValue')}
          </span>
          <span className={c('value value--old')}>{formatValue(suggestion.baseValue)}</span>
        </div>
        <div className={c('value-col')}>
          <span className={c('value-label')}>{t('tours.suggestions.suggestedValue')}</span>
          <span className={c('value value--new')}>{formatValue(suggestion.value, true)}</span>
        </div>
      </div>

      {capBlocked && (
        <p className={c('cap-hint')}>
          {capRelief ? t('tours.suggestions.capHint') : t('tours.suggestions.capHintBlocked')}
        </p>
      )}

      {isPending && (
        <div className={c('row-actions')}>
          {mode === 'owner' ? (
            <>
              <BaseButton
                type="button"
                variant="primary"
                size="sm"
                disabled={busy || capBlocked}
                data-testid="accept-btn"
                onClick={() => onAccept?.(suggestion)}
              >
                <BaseIcon name="check" />
                {t('tours.suggestions.acceptBtn')}
              </BaseButton>
              <BaseButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                data-testid="decline-btn"
                onClick={() => onDecline?.(suggestion)}
              >
                <BaseIcon name="close" />
                {t('tours.suggestions.declineBtn')}
              </BaseButton>
            </>
          ) : (
            <BaseButton
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              data-testid="withdraw-btn"
              onClick={() => onWithdraw?.(suggestion)}
            >
              <BaseIcon name="delete" />
              {t('tours.suggestions.withdrawBtn')}
            </BaseButton>
          )}
        </div>
      )}
    </div>
  );
}
