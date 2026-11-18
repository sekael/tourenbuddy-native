import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';

import { ListRow, ListSection, PickerRow, SliderRow, StepperRow } from '@/core/adaptive/list';

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

  it('should keep its modifiers while disabled comes and goes, so its drawn icon stays', async () => {
    const row = (disabled: boolean) => (
      <ListRow
        title="Delete contact"
        icon="delete"
        destructive
        disabled={disabled}
        onPress={jest.fn()}
      />
    );
    const types = () =>
      screen.container
        .queryAll((node) => Array.isArray(node.props.modifiers) && !!node.props.onButtonPress)[0]!
        .props.modifiers.map((m: { $type: string }) => m.$type);

    const view = await render(row(false));
    const before = types();
    await view.rerender(row(true));

    // A modifier added or dropped makes SwiftUI build the row anew, and the icon with it blank.
    expect(types()).toEqual(before);
  });

  it('should show a count as text, its modifiers kept as it drops to none', async () => {
    const row = (count: number) => (
      <ListRow title="Friend requests" icon="group" badge={count} onPress={jest.fn()} />
    );
    const types = () =>
      screen.container
        .queryAll((node) => Array.isArray(node.props.modifiers) && !!node.props.onButtonPress)[0]!
        .props.modifiers.map((m: { $type: string }) => m.$type);
    const counts = () => screen.container.queryAll((node) => node.props.text === '1');

    const view = await render(row(1));
    const before = types();
    expect(counts()).toHaveLength(1);
    await view.rerender(row(0));

    // SwiftUI's badge would come and go with the count: the row built anew, its icon blank.
    expect(types()).toEqual(before);
    expect(counts()).toHaveLength(0);
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

describe('StepperRow on iOS', () => {
  it('should count tenths in whole steps, as the system stepper only steps whole numbers', async () => {
    const onChange = jest.fn();
    await render(
      <StepperRow title="Tempo" value={1} min={0.5} max={1.5} step={0.1} onChange={onChange} />,
    );

    const [stepper] = screen.container.queryAll((node) => node.props.label === 'Tempo: 1');
    // Whole numbers would make 0.5–1.5 by 0.1 into 0–1 by 0: a pace the profile can't save.
    expect(stepper!.props).toMatchObject({ value: 10, min: 5, max: 15, step: 1 });
    await fireEvent(stepper!, 'valueChange', { nativeEvent: { value: 11 } });
    expect(onChange).toHaveBeenCalledWith(1.1);
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

describe('SliderRow on iOS', () => {
  const slider = () => screen.container.queryAll((n) => n.props.onValueChanged).at(-1)!;
  const shown = () =>
    screen.container.queryAll((n) => n.props.text?.endsWith?.('×')).at(-1)!.props.text;
  const row = (value: number, onChange: (v: number) => Promise<unknown> | void) => (
    <SliderRow
      title="Pace"
      value={value}
      min={0.5}
      max={1.5}
      step={0.1}
      format={(v) => `${v.toFixed(1)}×`}
      minIcon="snail"
      maxIcon="cruelty_free"
      onChange={onChange}
    />
  );
  const drag = async (to: number) => {
    await fireEvent(slider(), 'editingChanged', { nativeEvent: { isEditing: true } });
    await fireEvent(slider(), 'valueChanged', { nativeEvent: { value: to, eventCount: 1 } });
    await fireEvent(slider(), 'editingChanged', { nativeEvent: { isEditing: false } });
  };

  it('should keep the new value once let go until the save is done, never the old one between', async () => {
    let saved!: () => void;
    const onChange = jest.fn(() => new Promise<void>((resolve) => (saved = resolve)));
    const view = await render(row(1, onChange));

    await drag(1.3);
    expect(onChange).toHaveBeenCalledWith(1.3);
    expect(shown()).toBe('1.3×'); // the store still says 1.0 until the server answers

    await view.rerender(row(1.3, onChange)); // the store has it
    await act(async () => saved());
    expect(shown()).toBe('1.3×');
    expect(slider().props.value).toBe(1.3);
  });

  it('should show the old value again when the save fails', async () => {
    const view = await render(row(1, () => Promise.reject(new Error('offline'))));

    await drag(0.7);
    await act(async () => {});
    await view.rerender(row(1, () => {}));

    expect(shown()).toBe('1.0×');
  });
});
