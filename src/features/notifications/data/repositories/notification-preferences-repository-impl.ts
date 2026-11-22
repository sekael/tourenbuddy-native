import type { NotificationPreferences } from '../../domain/entities/notification-preferences';
import type { NotificationPreferencesRepository } from '../../domain/repositories/notification-preferences-repository';
import { supabase } from '@/core/supabase';
import { notificationPreferencesRowSchema } from '../models/notification-schemas';

export class NotificationPreferencesRepositoryImpl implements NotificationPreferencesRepository {
  async getPreferences(userId: string): Promise<NotificationPreferences | null> {
    const { data, error } = await supabase
      .from('user_profile')
      .select('notif_email_enabled, notif_muted_types')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return notificationPreferencesRowSchema.parse(data);
  }

  async updatePreferences(userId: string, prefs: NotificationPreferences): Promise<void> {
    const { error } = await supabase
      .from('user_profile')
      .update({
        notif_email_enabled: prefs.notifEmailEnabled,
        notif_muted_types: prefs.notifMutedTypes,
      })
      .eq('id', userId);

    if (error) throw new Error(error.message);
  }
}
