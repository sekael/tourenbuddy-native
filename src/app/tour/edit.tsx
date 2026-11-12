import { useLocalSearchParams } from 'expo-router';

import { TourFormRoute } from '@/features/tours/presentation/tour-form-route';

export default function TourEditRoute() {
  const { id, suggest } = useLocalSearchParams<{ id?: string; suggest?: string }>();
  return <TourFormRoute id={id ?? null} suggest={suggest === '1'} />;
}
