import { beforeEach, describe, expect, it } from 'vitest';
import { useCounterStore } from '@/stores/counter-store';

describe('counter store', () => {
  beforeEach(() => {
    useCounterStore.getState().reset();
  });

  it('increments and decrements', () => {
    const { increment, decrement } = useCounterStore.getState();
    increment();
    increment();
    decrement();
    expect(useCounterStore.getState().count).toBe(1);
  });

  it('resets to 0', () => {
    const { increment, reset } = useCounterStore.getState();
    increment();
    reset();
    expect(useCounterStore.getState().count).toBe(0);
  });
});
