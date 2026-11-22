import { UserProfileRepositoryImpl } from '@/features/user/data/repositories/user-profile-repository-impl';
const mockUpsert = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/core/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'u1' } } },
      }),
    },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

describe('userProfileRepositoryImpl.upsertProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const chainResult = {
      id: 'u1',
      first_name: 'A',
      last_name: 'B',
      locale: 'de-CH',
      onboarding_tour_show_at_sign_in: true,
      onboarding_tour_last_step: 0,
      calendar_tour_show_on_first_open: true,
      calendar_feature_notice_show_at_sign_in: false,
    };

    const chain = {
      upsert: mockUpsert.mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: chainResult, error: null }),
    };

    mockFrom.mockReturnValue(chain);
  });

  it('should include locale in upsert payload', async () => {
    const { UserProfileRepositoryImpl } =
      require('@/features/user/data/repositories/user-profile-repository-impl') as typeof import('@/features/user/data/repositories/user-profile-repository-impl');
    const repo = new UserProfileRepositoryImpl();
    await repo.upsertProfile({
      id: 'u1',
      firstName: 'A',
      lastName: 'B',
      locale: 'de-CH',
      onboardingTourShowAtSignIn: true,
      onboardingTourLastStep: 0,
      calendarTourShowOnFirstOpen: true,
      calendarFeatureNoticeShowAtSignIn: false,
      pace: 1,
      updatedAt: null,
    });

    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ locale: 'de-CH' }));
  });

  it('should include null locale in upsert payload', async () => {
    const { UserProfileRepositoryImpl } =
      require('@/features/user/data/repositories/user-profile-repository-impl') as typeof import('@/features/user/data/repositories/user-profile-repository-impl');
    const repo = new UserProfileRepositoryImpl();
    await repo.upsertProfile({
      id: 'u1',
      firstName: 'A',
      lastName: 'B',
      locale: null,
      onboardingTourShowAtSignIn: true,
      onboardingTourLastStep: 0,
      calendarTourShowOnFirstOpen: true,
      calendarFeatureNoticeShowAtSignIn: false,
      pace: 1,
      updatedAt: null,
    });

    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ locale: null }));
  });

  it('should include calendar feature notice gate in upsert payload', async () => {
    const { UserProfileRepositoryImpl } =
      require('@/features/user/data/repositories/user-profile-repository-impl') as typeof import('@/features/user/data/repositories/user-profile-repository-impl');
    const repo = new UserProfileRepositoryImpl();
    await repo.upsertProfile({
      id: 'u1',
      firstName: 'A',
      lastName: 'B',
      locale: 'de-CH',
      onboardingTourShowAtSignIn: true,
      onboardingTourLastStep: 0,
      calendarTourShowOnFirstOpen: true,
      calendarFeatureNoticeShowAtSignIn: true,
      pace: 1,
      updatedAt: null,
    });

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ calendar_feature_notice_show_at_sign_in: true }),
    );
  });
});
