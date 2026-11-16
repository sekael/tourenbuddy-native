import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/core/i18n';
import { SeasonsChart } from '@/features/calendar/presentation/seasons-chart';
import type { Tour } from '@/features/tours/domain/entities/tour';

const tour = (id: string, name: string | null, seasons: string[] | null) =>
  ({ id, name, seasons, tourTypes: ['hiking'] }) as unknown as Tour;

describe('SeasonsChart', () => {
  it('should order tours along the axis, a tour without seasons last and saying so', async () => {
    await render(
      <SeasonsChart
        tours={[
          tour('a', 'Anywhere', null),
          tour('s', 'Summer', ['summer']),
          tour('w', 'Winter and summer', ['summer', 'winter']),
          tour('b', 'Bike', ['spring', 'summer', 'autumn']),
        ]}
        onOpen={jest.fn()}
      />,
    );

    const rows = screen.getAllByRole('button').map((row) => row.props.accessibilityLabel);
    expect(rows).toEqual([
      // Winter before summer, whatever order the tour lists them in.
      'Winter and summer, Hiking, Winter, Summer',
      'Bike, Hiking, Spring, Summer, Autumn',
      'Summer, Hiking, Summer',
      'Anywhere, Hiking, No seasons scheduled',
    ]);
  });

  it('should open an unnamed tour by its id', async () => {
    const onOpen = jest.fn();
    await render(<SeasonsChart tours={[tour('x', null, ['autumn'])]} onOpen={onOpen} />);

    await fireEvent.press(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith('x');
  });
});
