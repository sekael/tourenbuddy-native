import { act, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { Text } from '@/core/adaptive/text';
import { strong } from '@/core/theme/tokens';

const weight = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style).fontWeight;

describe('Text with Bold Text', () => {
  it('should step each weight up while Bold Text is on and back when it is off', async () => {
    await render(
      <>
        <Text>Plain</Text>
        <Text style={strong}>Strong</Text>
      </>,
    );
    const plain = weight('Plain');
    const changed = jest
      .mocked(AccessibilityInfo.addEventListener)
      .mock.calls.find(([event]) => event === 'boldTextChanged')![1] as (on: boolean) => void;

    await act(() => changed(true));
    expect(weight('Plain')).toBe('600');
    expect(weight('Strong')).toBe(Number(strong.fontWeight) < 700 ? '700' : '800');

    await act(() => changed(false));
    expect(weight('Plain')).toBe(plain);
  });
});
