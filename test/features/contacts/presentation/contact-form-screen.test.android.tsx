import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/core/i18n';
import type { Contact } from '@/features/contacts/domain/entities/contact';
import { ContactFormScreen } from '@/features/contacts/presentation/contact-form-screen';
import { useContactsStore } from '@/features/contacts/presentation/stores/contacts-store';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), replace: jest.fn() },
  useNavigation: () => ({ setOptions: jest.fn() }),
}));
// Every row its own id, as on a device (Jest's native stub repeats one).
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('crypto').randomUUID() }));
const { router } = jest.requireMock<{ router: Record<string, jest.Mock> }>('expo-router');

const saveContact = jest.fn(async (_: Contact) => {});

beforeEach(() => {
  saveContact.mockClear();
  Object.values(router).forEach((fn) => fn.mockClear());
  useContactsStore.setState({ contacts: [], saveContact } as never);
});

const fields = (label: string) => screen.getAllByLabelText(label);

async function newContact(numbers: [string, string][]) {
  await render(<ContactFormScreen id={null} />);
  await fireEvent.changeText(fields('First Name')[0]!, 'Anna');
  for (const [i, [value, label]] of numbers.entries()) {
    if (i > 0) await fireEvent.press(screen.getByText('Add phone'));
    await fireEvent.changeText(fields('Phone')[i]!, value);
    await fireEvent.changeText(fields('Label (optional)')[i]!, label);
  }
}

const saved = () => saveContact.mock.calls[0]![0].contactMethods;

describe('ContactFormScreen', () => {
  it('should open a new contact in the Contacts tab, not as a sheet over it', async () => {
    await newContact([['+41 78 000 01 01', '']]);
    await fireEvent.press(screen.getByText('Save'));

    const id = saveContact.mock.calls[0]![0].id;
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: '/contacts',
      params: { open: `contact:${id}` },
    });
  });

  it('should keep each description with its number when another one becomes the main one', async () => {
    await newContact([
      ['+41 78 000 01 01', 'Mobile'],
      ['+41 78 000 01 02', 'Work'],
    ]);
    // The second number's own card offers it.
    await fireEvent.press(screen.getByLabelText('Set as primary, +41 78 000 01 02'));
    await fireEvent.press(screen.getByText('Save'));

    expect(saved()).toEqual([
      expect.objectContaining({ value: '+41780000101', label: 'Mobile', isPrimary: false }),
      expect.objectContaining({ value: '+41780000102', label: 'Work', isPrimary: true }),
    ]);
  });

  it('should hand the main number on when the main one is removed', async () => {
    await newContact([
      ['+41 78 000 01 01', 'Mobile'],
      ['+41 78 000 01 02', 'Work'],
    ]);
    await fireEvent.press(screen.getByLabelText('Remove phone, +41 78 000 01 01'));
    await fireEvent.press(screen.getByText('Save'));

    expect(saved()).toEqual([
      expect.objectContaining({ value: '+41780000102', label: 'Work', isPrimary: true }),
    ]);
  });
});
