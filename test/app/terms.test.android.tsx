import { fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { TERMS_VERSION } from '@/features/terms/domain/terms';

import { resetAuth, signIn } from '../support/auth';
import { fakeTerms } from '../support/fake-terms';
import { routes as appRoutes } from './routes';

// The native tab bar needs device icons; the gate never shows it anyway.
const routes = { ...appRoutes, '(tabs)/_layout': Slot };

// The terms gate's pages on Android and the web (Material): back is a button in the bar.
beforeEach(() => {
  resetAuth();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

it('should open the full terms over the gate and come back to it', async () => {
  signIn();
  fakeTerms.status = { current: TERMS_VERSION, accepted: null };
  await renderRouter(routes);

  await fireEvent.press(screen.getByRole('link', { name: 'terms of use' }));
  expect(screen.getByText(/Outdoor activities, especially in the mountains/)).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText(/TourenBuddy only stores and shares your plans/)).toBeOnTheScreen();
  expect(screen).toHavePathname('/accept-terms');
});
