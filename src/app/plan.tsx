import { useLocalSearchParams } from 'expo-router';

import { PlanRoute } from '@/features/tours/presentation/plan-route';

export default function PlanStep() {
  const { back, keep } = useLocalSearchParams<{ back?: string; keep?: string }>();
  return <PlanRoute back={back === '1'} keep={keep === '1'} />;
}
