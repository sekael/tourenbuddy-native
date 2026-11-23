import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createLogger } from '@/core/logging/logger';
import { BaseIcon } from '@/core/web/base-icon.web';
import { classes } from '@/core/web/classes';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingKey, outingSegments } from '@/features/tours/domain/outing';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import styles from './segment-add-view.module.css';
import { TourListRow } from './tour-list-row.web';

const c = classes(styles);
const log = createLogger('segment-add-view');

/**
 * "Add a segment" after `anchor` (#338, design D17): a new goal on the map, or one of the owner's
 * standalone tours. Rendered in place of a sheet's body — one day is one tour, a night starts the
 * next segment (smarter-tour-creation D8).
 */
export function SegmentAddView({
  anchor,
  onPickNew,
  onAdded,
}: {
  anchor: Tour;
  /** Pick a new goal on the map; the host seeds the creation form. */
  onPickNew: () => void;
  /** An existing tour joined; carries the outing's key. */
  onAdded: (outingKey: string) => void;
}) {
  const { t } = useTranslation('web');
  const tours = useToursStore((s) => s.tours);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Own tours in no outing yet, dated ones first. */
  const candidates = tours
    .filter((x) => x.id !== anchor.id && outingSegments(tours, outingKey(x)).length === 0)
    .sort(
      (a, b) => (a.plannedDate?.getTime() ?? Infinity) - (b.plannedDate?.getTime() ?? Infinity),
    );

  async function addExisting(tourId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await useToursStore.getState().addToOuting(anchor.id, tourId);
      const now = useToursStore.getState().tours.find((x) => x.id === anchor.id);
      const key = now && outingKey(now);
      if (key) onAdded(key);
    } catch (err) {
      log.error('Adding a segment failed', err);
      setError(t('tours.outing.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={c('add-view')}>
      <p className={c('rule')} data-testid="segment-rule">
        <BaseIcon name="info" size="sm" className={c('rule-icon')} />
        {t('tours.outing.ruleHint')}
      </p>
      <button
        type="button"
        className={c('new-segment')}
        data-testid="add-segment-new"
        onClick={onPickNew}
      >
        <span className={c('new-icon')}>
          <BaseIcon name="add_location_alt" />
        </span>
        <span className={c('new-text')}>
          <span className={c('new-title')}>{t('tours.outing.addNew')}</span>
          <span className={c('new-hint')}>{t('tours.outing.addNewHint')}</span>
        </span>
      </button>
      {error && <p className={c('error')}>{error}</p>}
      <h4 className={c('section-title')}>{t('tours.outing.addExistingHeader')}</h4>
      {candidates.length > 0 ? (
        <ul className={c('candidates', { 'candidates--busy': busy })}>
          {candidates.map((x) => (
            <TourListRow key={x.id} tour={x} onClick={() => void addExisting(x.id)} />
          ))}
        </ul>
      ) : (
        <p className={c('empty')}>{t('tours.outing.addExistingEmpty')}</p>
      )}
    </div>
  );
}
