import { useLocalSearchParams } from 'expo-router';

import { SuggestionsSheet } from '@/features/tours/presentation/suggestions-sheet';

export default function SuggestionsRoute() {
  const { id, history } = useLocalSearchParams<{ id: string; history?: string }>();
  return <SuggestionsSheet tourId={id} history={history === '1'} />;
}
