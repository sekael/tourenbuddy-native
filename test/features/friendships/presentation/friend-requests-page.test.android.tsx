import { act, fireEvent, render, screen } from '@testing-library/react-native';

import '@/core/i18n';
import { useAuthStore } from '@/features/auth/presentation/stores/auth-store';
import type { Contact } from '@/features/contacts/domain/entities/contact';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';
import { FriendRequestsPage } from '@/features/friendships/presentation/friend-requests-page';
import { useFriendshipsStore } from '@/features/friendships/presentation/stores/friendships-store';
import { useUserBlocksStore } from '@/features/friendships/presentation/stores/user-blocks-store';

const ANNA = '00000000-0000-4000-8000-00000000000a';
const BEN = '00000000-0000-4000-8000-00000000000b';
const ME = '00000000-0000-4000-8000-0000000000ff';
const HOUR = 3600_000;

const request = (id: string, from: string) => ({
  id,
  fromUserId: from,
  toUserId: ME,
  status: 'pending' as const,
  createdAt: '2026-11-15T10:00:00Z',
  respondedAt: null,
});

let finishDeny: () => void = () => {};
const deny = jest.fn(() => new Promise<void>((resolve) => (finishDeny = resolve)));

beforeEach(() => {
  deny.mockClear();
  useAuthStore.setState({ user: { id: ME, phone_confirmed_at: '2026-01-01' } as never });
  useFriendshipsStore.setState({
    incoming: [request('00000000-0000-4000-8000-000000000001', ANNA)],
    outgoing: [],
    userIdToPhoneMap: new Map([
      [ANNA, '+41790000201'],
      [BEN, '+41790000202'],
    ]),
    userIdToNamesMap: new Map(),
    deny,
    fetchAll: jest.fn(async () => {}),
    findPhonesByUserIds: jest.fn(async () => {}),
    getNamesByUserIds: jest.fn(async () => {}),
  } as never);
  useUserBlocksStore.setState({
    blocks: [],
    blockedUserIds: new Set(),
    blockedUserInfo: new Map(),
    fetchBlocks: jest.fn(async () => {}),
  } as never);
  useContactsStore.setState({ contacts: [] } as never);
});

describe('FriendRequestsPage', () => {
  it('should answer a request once when Deny is tapped twice', async () => {
    await render(<FriendRequestsPage />);

    await fireEvent.press(screen.getByText('Deny'));
    await fireEvent.press(screen.getByText('Deny'));
    await act(async () => finishDeny());

    expect(deny).toHaveBeenCalledTimes(1);
  });

  it('should offer no block for a sender the user already blocks', async () => {
    useUserBlocksStore.setState({ blockedUserIds: new Set([ANNA]) } as never);
    await render(<FriendRequestsPage />);

    expect(screen.getByText('Accept')).toBeOnTheScreen();
    expect(screen.queryByText('Block')).toBeNull();
  });

  it("should name a blocked user by the user's own contact, and offer the unblock only after 48 hours", async () => {
    const block = (id: string, hoursAgo: number) => ({
      blockerUserId: ME,
      blockedUserId: id,
      firstBlockedAt: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
      lastBlockedAt: new Date(Date.now() - hoursAgo * HOUR).toISOString(),
      unblockedAt: null,
    });
    useUserBlocksStore.setState({
      blocks: [block(ANNA, 1), block(BEN, 72)],
      blockedUserIds: new Set([ANNA, BEN]),
      blockedUserInfo: new Map([
        [ANNA, { firstName: 'Given', lastName: 'Name', phone: '+41790000201' }],
        [BEN, { firstName: null, lastName: null, phone: '+41790000202' }],
      ]),
    } as never);
    useContactsStore.setState({
      contacts: [
        {
          id: 'c1',
          firstName: 'Anna',
          lastName: 'Local',
          contactMethods: [
            { id: 'm1', methodType: 'phone', value: '+41790000201', isPrimary: true },
          ],
        } as unknown as Contact,
      ],
    } as never);
    useFriendshipsStore.setState({ incoming: [] } as never);
    await render(<FriendRequestsPage />);

    expect(screen.getByText('Anna Local')).toBeOnTheScreen();
    expect(screen.queryByText('Given Name')).toBeNull();
    // Within the cooldown a tap offers nothing; after it, the unblock.
    await fireEvent.press(screen.getByText('Anna Local'));
    expect(screen.queryByText('Unblock')).toBeNull();
    await fireEvent.press(screen.getByText('+41 79 000 02 02'));
    expect(screen.getByText('Unblock')).toBeOnTheScreen();
  });
});
