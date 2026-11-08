import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/core/adaptive/button';
import { TextField } from '@/core/adaptive/text-field';

// The Material button and field (Android and web).
describe('Button', () => {
  it('should be a button named by its label', async () => {
    const onPress = jest.fn();
    await render(<Button label="Send Code" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Send Code' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('should ignore presses and say so while disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Verify" onPress={onPress} disabled />);

    await fireEvent.press(screen.getByRole('button', { name: 'Verify' }));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Verify' })).toBeDisabled();
  });
});

describe('TextField', () => {
  it('should be named by its label, not its placeholder, also once filled', async () => {
    await render(<TextField label="Email address" placeholder="you@example.com" value="anna@x.ch" />);

    expect(screen.getByLabelText('Email address')).toHaveDisplayValue('anna@x.ch');
    expect(screen.queryByLabelText('you@example.com')).toBeNull();
  });
});
