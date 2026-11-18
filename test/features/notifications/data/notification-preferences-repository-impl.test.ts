import { supabase } from '@/core/supabase';

import { NotificationPreferencesRepositoryImpl } from '@/features/notifications/data/repositories/notification-preferences-repository-impl';

jest.mock('@/core/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const mockFrom = jest.mocked(supabase.from);

describe('notificationPreferencesRepositoryImpl', () => {
  let repo: NotificationPreferencesRepositoryImpl;

  beforeEach(() => {
    jest.clearAllMocks();
    repo = new NotificationPreferencesRepositoryImpl();
  });

  it('should return null when profile not found', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    } as never);

    const result = await repo.getPreferences('user-1');
    expect(result).toBeNull();
  });

  it('should return preferences with defaults parsed', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          notif_email_enabled: false,
          notif_muted_types: ['friend_requests'],
        },
        error: null,
      }),
    } as never);

    const result = await repo.getPreferences('user-1');
    expect(result).toEqual({
      notifEmailEnabled: false,
      notifMutedTypes: ['friend_requests'],
    });
  });

  it('should filter unknown muted types on parse', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          notif_email_enabled: true,
          notif_muted_types: [
            'friend_requests',
            'unknown_future_type',
            'availability',
            'tour_reminders',
            'release_notes',
          ],
        },
        error: null,
      }),
    } as never);

    const result = await repo.getPreferences('user-1');
    // release_notes is inbox-only: never a mute, even if a forged row lists it.
    expect(result?.notifMutedTypes).toEqual(['friend_requests', 'availability', 'tour_reminders']);
  });

  it('should throw on supabase error', async () => {
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    } as never);

    await expect(repo.getPreferences('user-1')).rejects.toThrow('DB error');
  });

  it('should call update with snake_case fields', async () => {
    const updateFn = jest.fn().mockReturnThis();
    const eqFn = jest.fn().mockResolvedValue({ error: null });
    mockFrom.mockReturnValue({ update: updateFn, eq: eqFn } as never);

    await repo.updatePreferences('user-1', {
      notifEmailEnabled: true,
      notifMutedTypes: [],
    });

    expect(updateFn).toHaveBeenCalledWith({
      notif_email_enabled: true,
      notif_muted_types: [],
    });
  });
});
