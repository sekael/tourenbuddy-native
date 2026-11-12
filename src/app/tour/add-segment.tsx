import { useLocalSearchParams } from 'expo-router';

import { AddSegmentSheet } from '@/features/tours/presentation/add-segment-sheet';

export default function AddSegmentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <AddSegmentSheet anchorId={id} />;
}
