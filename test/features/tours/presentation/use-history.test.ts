import { act, renderHook } from '@testing-library/react-native';
import { useState } from 'react';

import { useHistory } from '@/features/tours/presentation/use-history';

function useCounter() {
  const [value, setValue] = useState(0);
  const history = useHistory(() => value, setValue);
  return {
    value,
    history,
    set: (next: number) => {
      history.record();
      setValue(next);
    },
  };
}

describe('useHistory', () => {
  it('should step back and forth through every recorded change', async () => {
    const { result } = await renderHook(useCounter);
    await act(async () => result.current.set(1));
    await act(async () => result.current.set(2));
    expect(result.current.history.canRedo).toBe(false);

    await act(async () => result.current.history.undo());
    expect(result.current.value).toBe(1);
    await act(async () => result.current.history.undo());
    expect(result.current.value).toBe(0);
    expect(result.current.history.canUndo).toBe(false);

    await act(async () => result.current.history.redo());
    await act(async () => result.current.history.redo());
    expect(result.current.value).toBe(2);
    expect(result.current.history.canRedo).toBe(false);
  });

  it('should drop the redo once a new change is made after an undo', async () => {
    const { result } = await renderHook(useCounter);
    await act(async () => result.current.set(1));
    await act(async () => result.current.history.undo());
    expect(result.current.history.canRedo).toBe(true);

    await act(async () => result.current.set(5));
    expect(result.current.history.canRedo).toBe(false);
    await act(async () => result.current.history.redo());
    expect(result.current.value).toBe(5);
  });

  it('should do nothing on undo or redo with an empty history', async () => {
    const { result } = await renderHook(useCounter);
    await act(async () => result.current.history.undo());
    await act(async () => result.current.history.redo());
    expect(result.current.value).toBe(0);
  });
});
