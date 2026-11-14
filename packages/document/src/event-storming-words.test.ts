import { describe, expect, it } from 'vitest';
import { comparableWords, sameWords } from './event-storming-words';

describe('comparableWords', () => {
  it('ignores case, punctuation and repeated spaces', () => {
    expect(comparableWords('  Order   Placed! ')).toBe('order placed');
    expect(comparableWords('Café, déjà-vu 2')).toBe('café déjàvu 2');
    expect(comparableWords('?!')).toBe('');
  });
});

describe('sameWords', () => {
  it('holds for texts that differ only in what is ignored', () => {
    expect(sameWords('Order placed.', 'ORDER  PLACED')).toBe(true);
    expect(sameWords('Order placed', 'Order paid')).toBe(false);
  });
});
