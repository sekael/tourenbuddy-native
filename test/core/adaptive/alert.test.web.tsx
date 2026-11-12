import { Alert } from 'react-native';

import '@/core/adaptive/alert';

const confirm = jest.spyOn(window, 'confirm');
const alert = jest.spyOn(window, 'alert').mockImplementation(() => {});

beforeEach(() => jest.clearAllMocks());

describe('Alert.alert on the web', () => {
  it('should confirm a single action and run Cancel when refused', () => {
    const discard = jest.fn();
    const keep = jest.fn();
    confirm.mockReturnValueOnce(false);
    Alert.alert('Discard changes?', undefined, [
      { text: 'Keep editing', style: 'cancel', onPress: keep },
      { text: 'Discard', style: 'destructive', onPress: discard },
    ]);
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
    expect(discard).not.toHaveBeenCalled();
    expect(keep).toHaveBeenCalled();
  });

  it('should offer several actions in turn, the safe one first', () => {
    const accept = jest.fn();
    const decline = jest.fn();
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    Alert.alert('Same tour?', 'Link them', [
      { text: 'Decline', style: 'destructive', onPress: decline },
      { text: 'Accept', onPress: accept },
    ]);
    expect(confirm.mock.calls.map(([text]) => text)).toEqual([
      'Same tour?\n\nLink them\n\nAccept?',
      'Same tour?\n\nLink them\n\nDecline?',
    ]);
    expect(decline).toHaveBeenCalled();
    expect(accept).not.toHaveBeenCalled();
  });

  it('should show a plain message as an alert', () => {
    Alert.alert('Blocked');
    expect(alert).toHaveBeenCalledWith('Blocked');
    expect(confirm).not.toHaveBeenCalled();
  });
});
