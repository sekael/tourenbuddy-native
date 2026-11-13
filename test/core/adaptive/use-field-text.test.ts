import { act, renderHook } from '@testing-library/react-native';

import { useFieldText } from '@/core/adaptive/use-field-text';

/** The field as the user types: its own text changes at once, the report follows. */
function type(field: ReturnType<typeof useFieldText>, next: string) {
  field.text.set(next);
  field.onTextChange(next);
}

describe('useFieldText', () => {
  it('should keep what was typed when the value comes back a keystroke behind', async () => {
    const onChange = jest.fn();
    const hook = await renderHook(({ value }: { value: string }) => useFieldText(value, onChange), {
      initialProps: { value: '' },
    });
    await act(async () => {
      type(hook.result.current, 'Wa');
      type(hook.result.current, 'Wan');
      type(hook.result.current, 'Wand');
    });

    // The store answers with the first keystroke only now.
    await hook.rerender({ value: 'Wa' });

    expect(hook.result.current.text.get()).toBe('Wand');
    expect(onChange).toHaveBeenLastCalledWith('Wand');
  });

  it('should take a value set from elsewhere (a lookup, a reset)', async () => {
    const hook = await renderHook(
      ({ value }: { value: string }) => useFieldText(value, jest.fn()),
      {
        initialProps: { value: '' },
      },
    );
    await act(async () => type(hook.result.current, 'Piz'));

    await hook.rerender({ value: 'Piz Bernina' });
    expect(hook.result.current.text.get()).toBe('Piz Bernina');

    await hook.rerender({ value: '' });
    expect(hook.result.current.text.get()).toBe('');
  });

  it('should report a clear from elsewhere (a result taken), not one typed', async () => {
    const onCleared = jest.fn();
    const hook = await renderHook(
      ({ value }: { value: string }) => useFieldText(value, jest.fn(), onCleared),
      { initialProps: { value: '' } },
    );
    await act(async () => {
      type(hook.result.current, 'M');
      type(hook.result.current, '');
    });
    await hook.rerender({ value: '' });
    expect(onCleared).not.toHaveBeenCalled();

    await act(async () => type(hook.result.current, 'Mürren'));
    await hook.rerender({ value: 'Mürren' });
    await hook.rerender({ value: '' });

    expect(onCleared).toHaveBeenCalledTimes(1);
  });
});
