import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';

import '@/core/i18n';
import { AboutPage, OPERATOR } from '@/features/user/presentation/about-pages';

describe('AboutPage', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('should name the operator in the imprint, with no placeholder left', async () => {
    await render(<AboutPage name="imprint" />);

    expect(
      screen.getByText(
        [
          'TourenBuddy is a private, non-commercial project operated by:',
          ...OPERATOR,
          'Switzerland',
        ].join('\n'),
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/\[/)).toBeNull();
  });

  it('should name the address when no mail app can write to it', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail app'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render(<AboutPage name="imprint" />);

    await fireEvent.press(screen.getByRole('link', { name: 'feedback@tourenbuddy.ch' }));

    expect(Linking.openURL).toHaveBeenCalledWith('mailto:feedback@tourenbuddy.ch');
    expect(alert).toHaveBeenCalledWith(expect.stringContaining('feedback@tourenbuddy.ch'));
  });
});
