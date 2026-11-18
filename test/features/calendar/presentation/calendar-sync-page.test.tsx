import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton, Linking } from 'react-native';

import { env } from '@/core/env';
import '@/core/i18n';
import { CalendarSyncPage } from '@/features/calendar/presentation/calendar-sync-page';
import { useCalendarFeedStore } from '@/features/calendar/presentation/stores/calendar-feed-store';

import { pressSwift, swiftButton } from '../../../support/swift-ui';

// iOS: SwiftUI rows render as inert views carrying their props (test/support/swift-ui.ts).
const removeFeed = jest.fn(async () => {});

beforeEach(() => {
  jest.clearAllMocks();
  env.EXPO_PUBLIC_NOTIFY_HOOK_URL = 'https://worker.example';
  useCalendarFeedStore.setState({
    feeds: [
      { id: 'f1', host: 'calendar.google.com', label: 'Feiertage', lastSyncedAt: null, lastError: null },
    ],
    settings: { coreStart: '08:00', coreEnd: '18:00', minFreeMinutes: 240, feedToken: 'tok' },
    load: jest.fn(async () => {}),
    removeFeed,
  } as never);
});

it("should hand the tours link to the calendar app to subscribe, not share it as a file", async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue();
  await render(<CalendarSyncPage onHelp={() => {}} />);

  await pressSwift('Subscribe in Calendar');

  expect(open).toHaveBeenCalledWith('webcal://worker.example/calendar/tok.ics');
});

it('should say how to subscribe by hand when no calendar app takes the link', async () => {
  jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no handler'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<CalendarSyncPage onHelp={() => {}} />);

  await pressSwift('Subscribe in Calendar');

  await waitFor(() => expect(alert).toHaveBeenCalledWith(expect.stringMatching(/Copy it/)));
});

it('should say it copied the link, then offer to copy again', async () => {
  jest.useFakeTimers();
  await render(<CalendarSyncPage onHelp={() => {}} />);

  await pressSwift('Copy');
  expect(swiftButton('Copied')).toBeTruthy();

  await act(async () => jest.advanceTimersByTime(2000));
  expect(swiftButton('Copy')).toBeTruthy();
  jest.useRealTimers();
});

it('should ask before disconnecting a calendar, naming it by its label', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<CalendarSyncPage onHelp={() => {}} />);

  // A menu's buttons carry their label as a prop.
  const item = screen.container.queryAll(
    (n) => n.props.label === 'Disconnect Feiertage' && !!n.props.onButtonPress,
  )[0]!;
  await act(() => fireEvent(item, 'buttonPress'));

  expect(removeFeed).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0]![2] as AlertButton[];
  await act(async () => buttons.find((b) => b.style === 'destructive')!.onPress!());
  expect(removeFeed).toHaveBeenCalledWith('f1');
});
