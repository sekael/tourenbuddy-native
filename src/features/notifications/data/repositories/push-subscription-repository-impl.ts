import type {
  PushSubscriptionData,
  PushSubscriptionRepository,
} from '../../domain/repositories/push-subscription-repository';
import { supabase } from '@/core/supabase';

export class PushSubscriptionRepositoryImpl implements PushSubscriptionRepository {
  async register(data: PushSubscriptionData): Promise<void> {
    // RPC, not an upsert: an endpoint left behind by another account on a shared browser
    // is reassigned server-side, which RLS would reject for a plain upsert.
    const { error } = await supabase.rpc('register_push_subscription', {
      p_endpoint: data.endpoint,
      p_p256dh: data.p256dh,
      p_auth: data.auth,
      p_user_agent: data.userAgent,
    });
    if (error) throw new Error(error.message);
  }

  async removeSubscription(endpoint: string): Promise<void> {
    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);

    if (error) throw new Error(error.message);
  }
}
