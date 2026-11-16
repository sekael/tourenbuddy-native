import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/core/i18n';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import type { ImportResult } from '@/features/contacts/presentation/contact-import';
import { ImportResultsPage } from '@/features/contacts/presentation/contacts-list-page';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

const FRIEND = '00000000-0000-4000-8000-00000000000f';
const ANNA = '00000000-0000-4000-8000-00000000000a';
const BEN = '00000000-0000-4000-8000-00000000000b';

const card = (firstName: string, primaryPhone: string | null): ImportResult => ({
  firstName,
  lastName: null,
  primaryPhone,
  extraPhoneCount: 0,
  rawPhoneNumbers: [],
  status: 'imported',
});

const results = [
  card('Friend', '+41790000301'),
  card('Anna', '+41790000302'),
  card('Ben', '+41790000303'),
  card('Nobody', '+41790000304'),
  card('No phone', null),
];

const findUsersByPhones = jest.fn(async (_: string[]) => [
  { phone: '+41790000301', userId: FRIEND },
  { phone: '+41790000302', userId: ANNA },
  { phone: '+41790000303', userId: BEN },
]);
const sendRequest = jest.fn(async () => {});
const accept = jest.fn(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { phone_confirmed_at: '2026-01-01' } as never });
  useFriendshipsStore.setState({
    friendUserIds: new Set([FRIEND]),
    // Ben asked first.
    incoming: [
      {
        id: '00000000-0000-4000-8000-000000000001',
        fromUserId: BEN,
        toUserId: ANNA,
        status: 'pending',
        createdAt: '2026-11-15T10:00:00Z',
        respondedAt: null,
      },
    ],
    findUsersByPhones,
    sendRequest,
    accept,
  } as never);
});

describe('ImportResultsPage', () => {
  it('should ask the directory once, offering to connect with the non-friends it knows', async () => {
    await render(<ImportResultsPage results={results} />);
    await screen.findByText('Send request');

    expect(findUsersByPhones).toHaveBeenCalledTimes(1);
    expect(findUsersByPhones.mock.calls[0]![0].sort()).toEqual([
      '+41790000301',
      '+41790000302',
      '+41790000303',
      '+41790000304',
    ]);
    // A friend is offered nothing; Ben, who asked first, is accepted rather than asked.
    expect(screen.getAllByText('Send request')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Accept'));
    expect(accept).toHaveBeenCalledWith('00000000-0000-4000-8000-000000000001');
    expect(sendRequest).not.toHaveBeenCalled();
    expect(screen.getByText('You are now friends')).toBeOnTheScreen();
  });

  it('should offer nothing to a user whose own phone is unverified', async () => {
    useAuthStore.setState({ user: { phone_confirmed_at: null } as never });
    await render(<ImportResultsPage results={results} />);

    expect(findUsersByPhones).not.toHaveBeenCalled();
    expect(screen.queryByText('Send request')).toBeNull();
  });
});
