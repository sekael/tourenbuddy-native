import type { Tour } from '@/features/tours/domain/entities/tour';
import {
  friendTourIdsShadowedByOwned,
  ownedTourIdsShadowedByFriends,
} from '@/features/tours/domain/collision';

/**
 * The tours that get a marker: the user's own tours plus only the friend tours the user is a
 * partner on — non-partner friend tours never get one (the Friends list still shows every shared
 * tour). A partner friend tour colliding (COLLISION_RADIUS_M) with an owned tour is suppressed —
 * owned tours take precedence — unless it is the selection: then it overrides owned precedence at
 * its spot, un-shadowed AND hiding the owned tour(s) it collides with, so only the friend marker +
 * GPX show until deselected.
 *
 * `listed` (a narrowed tour list, #351) thins both sets first, so an owned tour the list hides no
 * longer shadows the friend tour it shares a spot with. Null = no narrowing.
 */
export function toursOnMap(
  owned: Tour[],
  friends: Tour[],
  selectedId: string | null,
  listed: Set<string> | null,
): Tour[] {
  const shown = (t: Tour) => !listed || listed.has(t.id);
  const ownedTours = owned.filter(shown);
  const partnerFriendTours = friends.filter((t) => t.isPartner === true && shown(t));
  const shadowed = friendTourIdsShadowedByOwned(ownedTours, partnerFriendTours);
  const hiddenOwned = new Set<string>();

  const selectedFriend = selectedId
    ? partnerFriendTours.find((t) => t.id === selectedId)
    : undefined;
  if (selectedFriend) {
    shadowed.delete(selectedFriend.id);
    for (const id of ownedTourIdsShadowedByFriends(ownedTours, [selectedFriend]))
      hiddenOwned.add(id);
  }

  return [
    ...ownedTours.filter((t) => !hiddenOwned.has(t.id)),
    ...partnerFriendTours.filter((t) => !shadowed.has(t.id)),
  ];
}
