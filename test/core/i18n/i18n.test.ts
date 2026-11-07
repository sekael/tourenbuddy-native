import i18n from '@/core/i18n';

describe('i18n catalogs', () => {
  afterEach(() => i18n.changeLanguage('en'));

  it('should use the zero form for 0 when a text defines one', () => {
    expect(i18n.t('tours.filters.showResultsBtn', { count: 0 })).toBe('Show 0 tours');
    expect(i18n.t('tours.list.friendsOnMap', { count: 0 })).toMatch(/^None of these/);
  });

  it('should use the plural form for 0 when a text has no zero form', () => {
    expect(i18n.t('tours.outing.dayCount', { count: 0 })).toBe('0 days');
  });

  it('should use the singular form for 1 and the plural form above', () => {
    expect(i18n.t('tours.filters.showResultsBtn', { count: 1 })).toBe('Show 1 tour');
    expect(i18n.t('tours.filters.showResultsBtn', { count: 2 })).toBe('Show 2 tours');
  });

  it('should pick German plural forms in de-CH', async () => {
    await i18n.changeLanguage('de-CH');
    expect(i18n.t('offlineSync.synced', { count: 1 })).toBe('1 Änderung synchronisiert');
    expect(i18n.t('offlineSync.synced', { count: 3 })).toBe('3 Änderungen synchronisiert');
  });

  it('should render a literal @ from a former vue-i18n escape', () => {
    expect(i18n.t('auth.emailEntry.emailPlaceholder')).toBe('you@example.com');
  });

  it('should fill named placeholders that are not counts', () => {
    expect(i18n.t('tours.creation.dayOf', { n: 2, count: 3 })).toBe('Day 2 of 3');
  });
});
