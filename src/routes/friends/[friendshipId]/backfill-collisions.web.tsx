import { BackfillCollisionsPage } from '@/features/tour-links/presentation/web/backfill-collisions-page.web';

/** The weekly digest's link: one friendship's overlapping tours, as a page. */
export default function BackfillCollisionsRoute() {
  return <BackfillCollisionsPage mode="friendship" />;
}
