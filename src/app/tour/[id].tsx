import { useLocalSearchParams } from 'expo-router';

import { TourSheet } from '@/features/tours/presentation/tour-sheet';

export default function TourRoute() {
  const { id, outing } = useLocalSearchParams<{ id: string; outing?: string }>();
  return <TourSheet id={id} {...(outing ? { outing } : {})} />;
}
