import { act, render, screen } from '@testing-library/react-native';

import '@/core/i18n';
import { connectivity } from '@/core/offline/online';
import { updateGate } from '@/core/update/gate';
import { UpdateGate } from '@/core/update/update-screen';

jest.mock('@/core/update/gate', () => {
  const { createStore } = jest.requireActual<typeof import('zustand/vanilla')>('zustand/vanilla');
  return {
    checkForUpdate: jest.fn(async () => {}),
    updateGate: createStore(() => ({ storeUrl: null as string | null })),
  };
});

afterEach(() => connectivity.setState({ online: true }));

describe('UpdateGate', () => {
  it('should never block while offline, and gate again once back online', async () => {
    connectivity.setState({ online: false });
    updateGate.setState({ storeUrl: 'https://apps.apple.com/app/id1' });
    await render(<UpdateGate />);
    expect(screen.queryByText('Update TourenBuddy')).toBeNull();

    await act(async () => connectivity.setState({ online: true }));
    expect(screen.getByText('Update TourenBuddy')).toBeOnTheScreen();
  });
});
