import { screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { routes as appRoutes } from '../../../app/routes';
import { resetAuth, signIn } from '../../../support/auth';

// Passkeys are iOS only (Face ID): Android shows the password, not the passkeys. A plain slot for
// the tabs, as in the navigation test: the native tab bar is checked on devices.
const routes = { ...appRoutes, '(tabs)/_layout': Slot };

beforeEach(() => signIn());

it('should offer the password but no passkeys on the Profile tab', async () => {
  await renderRouter(routes, { initialUrl: '/profile' });

  expect(screen.getByRole('button', { name: 'Password' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Passkeys' })).toBeNull();
});

it('should lead the passkeys address back to the Profile tab', async () => {
  await renderRouter(routes, { initialUrl: '/passkeys' });
  expect(screen).toHavePathname('/profile');
});

it('should offer no passkey sign-in', async () => {
  resetAuth();
  await renderRouter(routes, { initialUrl: '/auth' });

  expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Sign in with passkey' })).toBeNull();
});
