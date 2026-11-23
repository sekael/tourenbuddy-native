import { router } from 'expo-router';
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { BaseButton } from '@/core/web/base-button.web';
import { BaseIcon } from '@/core/web/base-icon.web';
import { BaseIconButton } from '@/core/web/base-icon-button.web';
import { BaseTooltip } from '@/core/web/base-tooltip.web';
import { BottomSheet } from '@/core/web/bottom-sheet.web';
import { classes } from '@/core/web/classes';
import { SearchInput } from '@/core/web/search-input.web';
import { SideDrawer } from '@/core/web/side-drawer.web';
import { Transition } from '@/core/web/transition.web';
import { useIsDesktop } from '@/core/web/use-media-query.web';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { BackfillCollisionsPage } from '@/features/tour-links/presentation/web/backfill-collisions-page.web';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { outingKey, outingSegments } from '@/features/tours/domain/outing';
import { useToursStore } from '@/features/tours/presentation/stores/tours-store';

import { OutingListRow } from './outing-list-row.web';
import { TourFiltersPanel } from './tour-filters-panel.web';
import styles from './tour-list-sheet.module.css';
import { TourListRow } from './tour-list-row.web';
import { useActiveTourTab, useListedTourIds, useTourFilters } from './use-tour-filters.web';

const c = classes(styles);

type ListEntry = { kind: 'tour'; tour: Tour } | { kind: 'outing'; key: string; segments: Tour[] };

const FILTERS_PANEL_ID = 'tour-filters-panel';

export function TourListSheet({
  onClose,
  onSelectTour,
  onSelectOuting,
  onAddTour,
}: {
  onClose: () => void;
  onSelectTour: (id: string) => void;
  onSelectOuting: (outingKey: string) => void;
  onAddTour: () => void;
}) {
  const { t } = useTranslation('web');
  const isAuthenticated = useAuthStore((s) => s.user !== null);
  const tours = useToursStore((s) => s.tours);
  const friendTours = useToursStore((s) => s.friendTours);
  const isLoading = useToursStore((s) => s.isLoading);
  const isDesktop = useIsDesktop();

  // Owned and Friends are separate, no merged list. Each tab keeps its own persistent search +
  // filters.
  const [activeTab, setActiveTab] = useActiveTourTab();
  const active = useTourFilters(activeTab);
  const { searchQuery, filters, filteredTours, activeFilterCount } = active;
  const source = activeTab === 'friends' ? friendTours : tours;

  /**
   * Rows after search + filters: an outing's segments fold into one row, placed where its first
   * matching segment was, and listing all its segments (#338, design D18).
   */
  const listEntries: ListEntry[] = [];
  const seen = new Set<string>();
  for (const tour of filteredTours) {
    const key = outingKey(tour);
    const segments = outingSegments(source, key);
    if (segments.length === 0) listEntries.push({ kind: 'tour', tour });
    else if (!seen.has(key!)) {
      seen.add(key!);
      listEntries.push({ kind: 'outing', key: key!, segments });
    }
  }

  // The map marks only friend tours the viewer is a partner on (map-integration), so a narrowed
  // Friends list says how many of its tours the map shows — else "Lena's tours" reads as broken.
  const listed = useListedTourIds();
  let friendsOnMap: number | null = null;
  if (activeTab === 'friends' && listed) {
    const marked = friendTours.filter((x) => listed.has(x.id) && x.isPartner === true).length;
    friendsOnMap = marked < listed.size ? marked : null;
  }

  const hasFriends = useFriendshipsStore((s) => s.friendships.length > 0);

  // Embedded backfill view: swaps the sheet body in place; back returns to the list with the
  // tab, search and filters intact.
  const [showBackfill, setShowBackfill] = useState(false);

  // Refetch friend tours when the Friends tab is opened.
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) {
      firstTab.current = false;
      return;
    }
    if (activeTab === 'friends') void useToursStore.getState().loadFriendTours();
  }, [activeTab]);

  // ── Filters view — open, the filters take the rows' place in the sheet's normal flow. A local
  // state, not module-level: returning from a tour remounts this sheet and shows the rows.
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const filtersRegionEl = useRef<HTMLDivElement>(null);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);
  const firstExpand = useRef(true);
  useEffect(() => {
    if (firstExpand.current) {
      firstExpand.current = false;
      return;
    }
    // Returning focus is the half that gets skipped; no scroll on focus: the tabs and search
    // above the filters stay in view.
    const el = filtersExpanded ? filtersRegionEl.current : filtersTriggerRef.current;
    el?.focus({ preventScroll: true });
  }, [filtersExpanded]);

  /** Escape folds the open filters first; the drawer closes on the next one. */
  function onListEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !filtersExpanded) return;
    e.preventDefault();
    setFiltersExpanded(false);
  }

  const headerActions = (
    <>
      {activeTab === 'friends' && hasFriends && isDesktop ? (
        <BaseTooltip text={t('tours.list.viewBackfillCollisionsBtn')}>
          <BaseIconButton
            name="sync_alt"
            label={t('tours.list.viewBackfillCollisionsBtn')}
            data-testid="header-backfill"
            onClick={() => setShowBackfill(true)}
          />
        </BaseTooltip>
      ) : activeTab === 'friends' && hasFriends ? (
        <BaseIconButton
          name="sync_alt"
          label={t('tours.list.viewBackfillCollisionsBtn')}
          data-testid="header-backfill"
          onClick={() => setShowBackfill(true)}
        />
      ) : null}
      <BaseIconButton
        name="calendar_today"
        label={t('calendar.openAriaLabel')}
        data-testid="header-open-calendar"
        data-tour="open-calendar"
        onClick={() => router.push('/calendar')}
      />
      {!isAuthenticated ? (
        <BaseTooltip text={t('map.overlay.signInToAddToursTooltip')}>
          <BaseIconButton
            name="add_location_alt"
            label={t('tours.list.addTourAriaLabel')}
            data-testid="header-add-tour"
            disabled
            onClick={onAddTour}
          />
        </BaseTooltip>
      ) : (
        <BaseIconButton
          name="add_location_alt"
          label={t('tours.list.addTourAriaLabel')}
          data-testid="header-add-tour"
          onClick={onAddTour}
        />
      )}
    </>
  );

  const footer =
    filtersExpanded && !showBackfill ? (
      <div className={c('filters-footer')}>
        <BaseButton
          variant="secondary"
          data-testid="clear-filters"
          disabled={activeFilterCount === 0}
          onClick={active.clearFilters}
        >
          {t('tours.filters.resetBtn')}
        </BaseButton>
        <BaseButton
          variant="primary"
          className={c('show-results')}
          data-testid="show-results"
          onClick={() => setFiltersExpanded(false)}
        >
          {t('tours.filters.showResultsBtn', { count: listEntries.length })}
        </BaseButton>
      </div>
    ) : undefined;

  const sourceCount = source.length;
  const body = showBackfill ? (
    <BackfillCollisionsPage mode="all" onBack={() => setShowBackfill(false)} />
  ) : (
    <div className={c('list-view', { 'list-view--drawer': isDesktop })}>
      <div className={c('list-header')}>
        <div
          className={c('tabs')}
          role="tablist"
          data-tour="tours"
          data-tab-indicator
          style={
            { '--tab-index': activeTab === 'friends' ? 1 : 0, '--tab-count': 2 } as CSSProperties
          }
        >
          <button
            type="button"
            role="tab"
            className={c('tab')}
            aria-selected={activeTab === 'owned'}
            onClick={() => setActiveTab('owned')}
          >
            {t('tours.list.tabOwned')}
          </button>
          <button
            type="button"
            role="tab"
            className={c('tab')}
            aria-selected={activeTab === 'friends'}
            onClick={() => setActiveTab('friends')}
          >
            {t('tours.list.tabFriends')}
          </button>
        </div>

        <SearchInput
          value={searchQuery}
          onChange={active.setSearchQuery}
          placeholder={t('tours.list.searchPlaceholder')}
        >
          <BaseButton
            ref={filtersTriggerRef}
            variant="secondary"
            size="sm"
            className={c('filters-trigger')}
            aria-expanded={filtersExpanded}
            aria-controls={FILTERS_PANEL_ID}
            onClick={() => setFiltersExpanded(!filtersExpanded)}
          >
            <BaseIcon name={filtersExpanded ? 'expand_less' : 'tune'} size="sm" />
            {t('tours.list.filtersBtn')}
            {activeFilterCount > 0 && (
              <span className={c('filter-badge')}>{activeFilterCount}</span>
            )}
          </BaseButton>
        </SearchInput>
      </div>

      {/* `min-height: 0` lets this shrink inside the flex column. */}
      <div className={c('list-region')}>
        {filtersExpanded && (
          <div
            id={FILTERS_PANEL_ID}
            ref={filtersRegionEl}
            className={c('region-scroll')}
            role="region"
            aria-label={t('tours.filters.panelAriaLabel')}
            tabIndex={-1}
          >
            <TourFiltersPanel
              filters={filters}
              tab={activeTab}
              tours={source}
              onChange={active.setFilters}
            />
          </div>
        )}
        {/* Kept mounted: the rows (and the drawer's scroll position) survive a look at the filters. */}
        <div
          className={c('tours-scroll region-scroll')}
          style={
            {
              '--swap-dir': activeTab === 'friends' ? 1 : -1,
              ...(filtersExpanded && { display: 'none' }),
            } as CSSProperties
          }
        >
          <Transition name="tab-swap" cls={c}>
            <div key={activeTab}>
              {activeTab === 'owned' && isLoading && tours.length === 0 ? (
                <div className={c('loading-text')}>{t('tours.list.loading')}</div>
              ) : sourceCount === 0 ? (
                <div className={c('empty-state')}>
                  <BaseIcon
                    name={activeTab === 'friends' ? 'group' : 'location_on'}
                    size="xl"
                    className={c('empty-icon')}
                  />
                  <p className={c('empty-text')}>
                    {activeTab === 'friends'
                      ? t('tours.list.friendsEmptyTitle')
                      : t('tours.list.emptyTitle')}
                  </p>
                  <p className={c('empty-sub')}>
                    {activeTab === 'friends'
                      ? t('tours.list.friendsEmptySubtitle')
                      : t('tours.list.emptySubtitle')}
                  </p>
                </div>
              ) : filteredTours.length === 0 ? (
                <div className={c('empty-state')}>
                  <BaseIcon name="search_off" size="xl" className={c('empty-icon')} />
                  <p className={c('empty-text')}>{t('tours.list.noMatchesTitle')}</p>
                  <BaseButton variant="primary" size="sm" onClick={active.clearAll}>
                    {t('tours.list.clearFiltersBtn')}
                  </BaseButton>
                </div>
              ) : (
                <>
                  {friendsOnMap !== null && (
                    <p className={c('map-note')} data-testid="friends-on-map">
                      <BaseIcon name="map" size="sm" />
                      {t('tours.list.friendsOnMap', { count: friendsOnMap })}
                    </p>
                  )}
                  <ul className={c('tours-list')}>
                    {listEntries.map((entry) =>
                      entry.kind === 'tour' ? (
                        <TourListRow
                          key={entry.tour.id}
                          tour={entry.tour}
                          onClick={() => onSelectTour(entry.tour.id)}
                        />
                      ) : (
                        <OutingListRow
                          key={entry.key}
                          segments={entry.segments}
                          onClick={() => onSelectOuting(entry.key)}
                        />
                      ),
                    )}
                  </ul>
                </>
              )}
            </div>
          </Transition>
        </div>
      </div>
    </div>
  );

  return isDesktop ? (
    <SideDrawer
      title={t('tours.list.title')}
      headerActions={headerActions}
      footer={footer}
      onClose={onClose}
      onKeyDown={onListEscape}
    >
      {body}
    </SideDrawer>
  ) : (
    <BottomSheet
      title={t('tours.list.title')}
      fitContent
      resizable={!filtersExpanded}
      holdHeight={!!searchQuery.trim() || activeFilterCount > 0 || filtersExpanded}
      headerActions={headerActions}
      footer={footer}
      onClose={onClose}
      onKeyDown={onListEscape}
    >
      {body}
    </BottomSheet>
  );
}
