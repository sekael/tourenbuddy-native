import { useLocalSearchParams } from 'expo-router';

import { TourSheet } from '@/features/tours/presentation/tour-sheet';

export default function TourRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TourSheet id={id} />;
}
