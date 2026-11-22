import { render, screen } from '@testing-library/react-native';

import '@/core/i18n';
import type { Tour } from '@/features/tours/domain/entities/tour';
import { TourRow } from '@/features/tours/presentation/tour-rows';

const tour = {
  id: 't',
  name: 'Haute Route',
  grade: 'ZS',
  tourTypes: ['skitour'],
  partnerIds: [],
  isFriendTour: false,
  completed: false,
  plannedDate: null,
} as unknown as Tour;

describe('TourRow', () => {
  it('should lead with the day of a multi-day tour', async () => {
    await render(<TourRow tour={tour} span={{ day: 2, total: 3 }} onPress={jest.fn()} />);
    expect(screen.getByLabelText('Haute Route, Day 2 of 3 · ZS')).toBeOnTheScreen();
  });

  it('should leave the subtitle alone without a span', async () => {
    await render(<TourRow tour={tour} onPress={jest.fn()} />);
    expect(screen.getByLabelText('Haute Route, ZS')).toBeOnTheScreen();
  });
});
