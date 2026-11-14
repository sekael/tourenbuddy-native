import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/core/i18n';
import { Screen } from '@/core/adaptive/screen';
import { CalendarFeedHelpPage } from '@/features/calendar/presentation/calendar-sync-page';

describe('CalendarFeedHelpPage', () => {
  it('should number the chosen provider steps and swap them on a new choice', async () => {
    await render(
      <Screen>
        <CalendarFeedHelpPage />
      </Screen>,
    );
    expect(screen.getByText(/^4\. No secret address\?/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('radio', { name: 'iCloud' }));
    expect(screen.getByText(/^1\. Open the Calendar app/)).toBeOnTheScreen();
    expect(screen.queryByText(/^4\./)).toBeNull();
  });
});
