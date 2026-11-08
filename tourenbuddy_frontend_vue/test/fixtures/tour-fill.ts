/**
 * Tour/TourDraft fields that fixtures don't care about. Spread first into a fixture
 * literal (its own keys then win), so a field added to the entity breaks no fixture.
 */
export const DRAFT_FILL = {
  endDate: null,
  startPointName: null,
  startPointElevation: null,
  endPointName: null,
  endPointElevation: null,
}

export const TOUR_FILL = {
  ...DRAFT_FILL,
  visibility: 'friends' as const,
  updatedAt: null,
  outing: null,
  grade: null,
  startTime: null,
  legs: null,
  isFriendTour: false,
}
