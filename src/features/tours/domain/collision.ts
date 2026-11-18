import type { TourType } from '@/features/tours/data/models/tour-type';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { isSameGoal } from '@/features/tours/domain/distance';

/**
 * Two goals within this distance are treated as the same objective. MUST stay
 * in sync with the `extensions.st_dwithin(…, 200)` literals in the tour-links
 * SQL functions (see migration `bump_tour_link_radius_to_200m`).
 */
export const COLLISION_RADIUS_M = 200;

/**
 * Same objective needs at least one activity in common — the client mirror of `&&` in
 * `fn_collision_predicate`. An untyped tour shares nothing, not even with another untyped one.
 */
export function sharesActivity(a: readonly TourType[], b: readonly TourType[]): boolean {
  return a.some((t) => b.includes(t));
}

/**
 * Ids of friend tours that collide (within COLLISION_RADIUS_M) with any owned tour. The map
 * suppresses these markers — owned tours take precedence — while the Friends list
 * keeps showing them untouched.
 */
export function friendTourIdsShadowedByOwned(ownedTours: Tour[], friendTours: Tour[]): Set<string> {
  const shadowed = new Set<string>();
  for (const friend of friendTours) {
    if (ownedTours.some((owned) => isSameGoal(owned.goal, friend.goal, COLLISION_RADIUS_M)))
      shadowed.add(friend.id);
  }
  return shadowed;
}

/**
 * Inverse of {@link friendTourIdsShadowedByOwned}: ids of owned tours that
 * collide (within 100m) with any of the given friend tours. The map calls this
 * scoped to the *selected* friend tour only — a friend tour opened from the list
 * temporarily overrides owned precedence at its location, so the colliding owned
 * marker is hidden (avoids a co-located cluster) until the friend tour is closed.
 */
export function ownedTourIdsShadowedByFriends(
  ownedTours: Tour[],
  friendTours: Tour[],
): Set<string> {
  const shadowed = new Set<string>();
  for (const owned of ownedTours) {
    if (friendTours.some((friend) => isSameGoal(friend.goal, owned.goal, COLLISION_RADIUS_M)))
      shadowed.add(owned.id);
  }
  return shadowed;
}
