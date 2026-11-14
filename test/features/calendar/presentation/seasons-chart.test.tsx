import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/core/i18n';
import { SeasonsChart } from '@/features/calendar/presentation/seasons-chart';
import type { Tour } from '@/features/tours/domain/entities/tour';

const tour = (
  id: string,
  name: string,
  seasons: Tour['seasons'],
  tourTypes: Tour['tourTypes'] = [],
) => ({ id, name, seasons, tourTypes }) as Tour;

const bars = () =>
  screen.container.queryAll(
    (n) =>
      n.type === 'View' && typeof (n.props.style as { width?: unknown }[])?.[1]?.width === 'string',
  );

describe('SeasonsChart', () => {
  it('should split seasons that are not adjacent and say when a tour has none', async () => {
    const open = jest.fn();
    await render(
      <SeasonsChart
        tours={[tour('a', 'Piz Ela', ['winter', 'summer'], ['skitour']), tour('b', 'Someday', [])]}
        onOpen={open}
      />,
    );

    expect(bars()).toHaveLength(2);
    expect(screen.getByText('No seasons scheduled')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Someday, No seasons scheduled' }));
    expect(open).toHaveBeenCalledWith('b');
  });

  it('should merge adjacent seasons into one bar', async () => {
    await render(
      <SeasonsChart tours={[tour('a', 'Hike', ['spring', 'summer'])]} onOpen={jest.fn()} />,
    );
    expect(bars()).toHaveLength(1);
  });
});
