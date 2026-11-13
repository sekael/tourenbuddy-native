import { fireEvent, render, screen } from '@testing-library/react-native';

import { Pills } from '@/core/adaptive/pills';

const options = [
  { value: 'hiking', label: 'Hiking' },
  { value: 'skitour', label: 'Ski touring' },
] as const;

describe('Pills', () => {
  it('should mark the picked ones and hand a tap on any pill to the caller', async () => {
    const onToggle = jest.fn();
    await render(<Pills options={[...options]} selected={['skitour']} onToggle={onToggle} />);

    expect(screen.getByRole('checkbox', { name: 'Ski touring' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Hiking' })).not.toBeChecked();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Ski touring' }));
    expect(onToggle).toHaveBeenCalledWith('skitour');
  });

  it('should be a radio group when only one may be on', async () => {
    await render(<Pills single options={[...options]} selected={[]} onToggle={jest.fn()} />);

    expect(screen.getAllByRole('radio')).toHaveLength(2);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
