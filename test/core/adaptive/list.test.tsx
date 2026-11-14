import { fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';

import { ListRow, ListSection, PickerRow } from '@/core/adaptive/list';

describe('ListSection on iOS', () => {
  it('should remount its rows when the footer comes or goes, so their drawn icons show again', async () => {
    const mounts = jest.fn();
    function Row() {
      useEffect(() => mounts(), []);
      return null;
    }
    const section = (footer?: string) => (
      <ListSection footer={footer}>
        <Row />
      </ListSection>
    );

    const view = await render(section());
    await view.rerender(section('Only you see this tour'));
    await view.rerender(section('Still only you'));
    await view.rerender(section());

    // Mounted at first, again with the footer, not for a new footer text, again without it.
    expect(mounts).toHaveBeenCalledTimes(3);
  });
});

describe('ListRow on iOS', () => {
  it('should paint a destructive swipe red without the role that makes SwiftUI drop the row', async () => {
    const remove = {
      label: 'Delete region',
      icon: 'delete' as const,
      destructive: true,
      onPress: jest.fn(),
    };
    await render(<ListRow title="Lauterbrunnen" swipeActions={[remove]} />);

    // A destructive role would take the row out before the app has asked and removed it.
    const [swipe] = screen.container.queryAll((node) => node.props.label === 'Delete region');
    expect(swipe!.props.role).toBeUndefined();
    expect(swipe!.props.modifiers).toEqual([expect.objectContaining({ $type: 'tint' })]);
  });

  it('should keep the destructive role in a menu, where it only paints the item red', async () => {
    const remove = {
      label: 'Delete region',
      icon: 'delete' as const,
      destructive: true,
      onPress: jest.fn(),
    };
    await render(<ListRow title="Lauterbrunnen" menu={[remove]} />);

    const [item] = screen.container.queryAll((node) => node.props.label === 'Delete region');
    expect(item!.props.role).toBe('destructive');
  });
});

describe('PickerRow, segmented under its icon and title', () => {
  it('should not pick a greyed part', async () => {
    const onChange = jest.fn();
    await render(
      <PickerRow
        style="segmented"
        title="Gleitschirm"
        icon="paragliding"
        value="down"
        onChange={onChange}
        options={[
          { value: 'up', label: 'Hinauf', disabled: true },
          { value: 'both', label: 'Beides' },
          { value: 'down', label: 'Hinunter' },
        ]}
      />,
    );

    await fireEvent.press(screen.getByRole('radio', { name: 'Hinauf' }));
    expect(onChange).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('radio', { name: 'Beides' }));
    expect(onChange).toHaveBeenCalledWith('both');
  });
});
