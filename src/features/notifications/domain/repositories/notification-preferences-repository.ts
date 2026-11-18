import type { NotificationPreferences } from '../entities/notification-preferences';

export interface NotificationPreferencesRepository {
  getPreferences: (userId: string) => Promise<NotificationPreferences | null>;
  updatePreferences: (userId: string, prefs: NotificationPreferences) => Promise<void>;
}
