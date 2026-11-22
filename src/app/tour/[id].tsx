import { useLocalSearchParams } from 'expo-router';

import type { TourOrigin } from '@/features/map/presentation/open-tour';
import { TourSheet } from '@/features/tours/presentation/tour-sheet';

export default function TourRoute() {
  const { id, outing, from } = useLocalSearchParams<{
    id: string;
    outing?: string;
    from?: TourOrigin;
  }>();
  return <TourSheet id={id} {...(outing ? { outing } : {})} {...(from ? { from } : {})} />;
}
