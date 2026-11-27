import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

import '@/core/i18n';
import { MonthGrid } from '@/features/calendar/presentation/month-grid';

const WIDTH = 350;
/** A month's page: its width and the gap to the next. */
const PAGE = WIDTH + 24;

function Calendar() {
  const [month, setMonth] = useState(new Date(2026, 9, 1));
  const [selected, setSelected] = useState('2026-10-29');
  return (
    <MonthGrid
      month={month}
      onMonth={setMonth}
      selected={selected}
      onSelect={setSelected}
      entriesByDay={new Map()}
      friendsByDay={new Map()}
      availableDays={new Set()}
      editing={false}
      onToggle={jest.fn()}
    />
  );
}

/** The calendar, measured, so its months are pages of a horizontal list. */
async function show() {
  await render(<Calendar />);
  const box = screen.container.queryAll((n) => typeof n.props.onLayout === 'function').at(-1)!;
  await fireEvent(box, 'layout', { nativeEvent: { layout: { width: WIDTH, height: 300 } } });
}

const pager = () => screen.container.queryAll((n) => n.props.snapToInterval === PAGE)[0]!;
/** Where the list opened: the month it was shown with, a century (1200 months) in. */
const start = () => 1200 * PAGE;
const at = (x: number) => ({
  nativeEvent: {
    contentOffset: { x, y: 0 },
    contentSize: { width: PAGE * 2401, height: 300 },
    layoutMeasurement: { width: WIDTH, height: 300 },
  },
});
const title = () => screen.getByRole('heading').props.children as string;

describe('MonthGrid', () => {
  it('should name the next month once a swipe has it half in view, before it settles', async () => {
    await show();
    const from = start();
    expect(title()).toBe('October 2026');

    await fireEvent(pager(), 'scrollBeginDrag', at(from));
    await fireEvent.scroll(pager(), at(from + PAGE * 0.4));
    expect(title()).toBe('October 2026');

    await fireEvent.scroll(pager(), at(from + PAGE * 0.6));
    expect(title()).toBe('November 2026');

    await fireEvent(pager(), 'momentumScrollEnd', at(from + PAGE));
    expect(title()).toBe('November 2026');
  });

  it('should go back a month when swiped the other way', async () => {
    await show();
    const from = start();

    await fireEvent(pager(), 'scrollBeginDrag', at(from));
    await fireEvent(pager(), 'momentumScrollEnd', at(from - PAGE));
    expect(title()).toBe('September 2026');
  });

  it("should not be pulled back by the arrows' own scrolling as it passes the month before", async () => {
    await show();
    const from = start();

    // Two months on by the arrow; the list scrolls there and reports the months it passes.
    await fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Next month' }));
    await fireEvent.scroll(pager(), at(from + PAGE));
    await fireEvent(pager(), 'momentumScrollEnd', at(from + PAGE * 1.2));

    expect(title()).toBe('December 2026');
  });
});
