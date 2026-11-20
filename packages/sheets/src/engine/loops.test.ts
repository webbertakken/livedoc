// formulas.md "Recalculation": a loop is found whole, every cell of it told the same; iterative calculation works it
// out round by round (settings.md "Calculation").
import { describe, expect, it, vi } from 'vitest';
import { book } from '../testing/book';
import { err } from '../formula/values';
import { Loops } from './loops';
import { settled } from './loop-rounds';

const ON = { on: true, max: 50, threshold: 0.05 };

describe('a loop with iterative calculation off', () => {
  it('shows #REF! in every cell of it, even one catching errors, whichever is read first', () => {
    for (const first of ['A1', 'B1']) {
      const b = book({ A1: '=B1', B1: '=IFERROR(A1, 5)' });
      expect(b.v(first)).toMatchObject({ e: '#REF!' });
      expect(b.v(first === 'A1' ? 'B1' : 'A1')).toMatchObject({
        e: '#REF!',
        why: expect.stringMatching(/^Circular dependency detected: /),
      });
    }
  });

  it('leaves a cell reading the loop out of it', () => {
    const b = book({ A1: '=B1', B1: '=A1', C1: '=IFERROR(A1, 7)', D1: '=C1+1' });
    expect(b.v('D1')).toBe(8);
    expect(b.v('C1')).toBe(7);
    b.set('B1', '3');
    expect(b.v('D1')).toBe(4);
  });

  it('finds a loop through a third cell read along the way, and a cell reading itself', () => {
    const b = book({ A1: '=B1+C1', B1: '=A1', C1: '=IFERROR(B1*2, 1)', E1: '=IFERROR(E1, 1)' });
    expect(b.v('A1')).toMatchObject({ e: '#REF!' });
    expect(b.v('C1')).toMatchObject({ e: '#REF!' });
    expect(b.v('E1')).toMatchObject({ e: '#REF!', why: 'Circular dependency detected: E1 → E1' });
  });
});

describe('a loop with iterative calculation on', () => {
  it('works a loop out until it settles under the threshold (B1 as LibreOffice answers)', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const b = book({ B1: '=(B1+10)/2', C1: '=D1+1', D1: '=C1*0.5' }, { iteration: ON });
    expect(b.v('B1')).toBe(9.9609375);
    // Read from C1, its first cell is D1 (worked out first): each round reads the round before's D1.
    expect([b.v('C1'), b.v('D1')]).toEqual([1.96875, 0.984375]);
    expect(debug).toHaveBeenCalledWith(
      expect.stringMatching(/^\[sheets engine\] loop cells=2 iterate=true/),
    );
  });

  it('stops at its most rounds, and the next recalculation starts from where it settled', () => {
    const b = book({ A1: '=A1+1+K1', K1: '0' }, { iteration: { ...ON, max: 20 } });
    expect(b.v('A1')).toBe(20);
    b.set('K1', '0');
    expect(b.v('A1')).toBe(40);
    // Its own cell retyped starts afresh.
    b.set('A1', '=A1+1+K1');
    expect(b.v('A1')).toBe(20);
  });

  it('keeps a value a formula keeps by reading itself', () => {
    const b = book({ A1: '=IF(A1="", B1, A1)', B1: '1' }, { iteration: ON });
    expect(b.v('A1')).toBe(1);
    b.set('B1', '2');
    expect(b.v('A1')).toBe(1);
  });

  it('settles errors and arrays', () => {
    const b = book({ A1: '=A1/0', C1: '=SEQUENCE(2)+C1*0' }, { iteration: ON });
    expect(b.v('A1')).toMatchObject({ e: '#DIV/0!' });
    expect([b.v('C1'), b.v('C2')]).toEqual([1, 2]);
  });

  it('works a loop out again when a long chain cuts a read short, in a round or before one', () => {
    const chain: Record<string, string> = { C1: '1' };
    for (let i = 2; i <= 600; i++) chain[`C${i}`] = `=C${i - 1}+1`;
    // B1 waits on the loop when D1 reaches down the chain.
    const first = book(
      { ...chain, A1: '=B1+D1', B1: '=A1*0', D1: '=INDIRECT("C600")' },
      { rows: 600 },
    );
    expect(first.v('A1')).toMatchObject({ e: '#REF!' });
    expect(first.v('D1')).toBe(600);
    // The third round reaches down the chain.
    const later = book(
      { ...chain, A1: '=B1', B1: '=IF(A1>1, INDIRECT("C600"), A1+1)' },
      { rows: 600, iteration: ON },
    );
    expect(later.v('A1')).toBe(600);
    expect(later.v('B1')).toBe(600);
  });

  it('leaves a loop deeper than the stack as #REF! (D36)', () => {
    const cells: Record<string, string> = { A1: '=A300' };
    for (let i = 2; i <= 300; i++) cells[`A${i}`] = `=A${i - 1}+1`;
    const b = book(cells, { rows: 300, iteration: ON });
    expect(b.v('A300')).toMatchObject({ e: '#REF!' });
  });

  it('turns on and off with the workbook’s settings, working every value out afresh', () => {
    const b = book({ B1: '=(B1+10)/2' });
    expect(b.v('B1')).toMatchObject({ e: '#REF!' });
    const version = b.wb.version;
    b.wb.setIteration({ on: false, max: 50, threshold: 0.05 });
    expect(b.wb.version).toBe(version);
    b.wb.setIteration(ON);
    expect(b.v('B1')).toBe(9.9609375);
    // One round, from where it last settled.
    b.wb.setIteration({ ...ON, max: 1 });
    expect(b.v('B1')).toBe(9.98046875);
  });
});

describe('Loops', () => {
  it('ignores a read back to a formula it is not tracking, and one with nothing open', () => {
    const loops = new Loops();
    loops.readBack(1);
    const visit = loops.enter(1);
    loops.readBack(2);
    expect(loops.leave(1, visit)).toEqual([]);
    expect(loops.abandon()).toEqual([]);
  });
});

describe('settled', () => {
  it('compares numbers within the threshold, and everything else exactly', () => {
    expect(settled([1, 'a', true, null], [1.01, 'a', true, null], 0.05)).toBe(true);
    expect(settled([1], [1.1], 0.05)).toBe(false);
    expect(settled([2], [2], 0)).toBe(true);
    expect(settled(['a'], ['b'], 1)).toBe(false);
    expect(settled([null], [0], 1)).toBe(false);
    expect(settled([err('#N/A')], [err('#N/A', 'why')], 1)).toBe(true);
    expect(settled([err('#N/A')], [err('#REF!')], 1)).toBe(false);
    expect(settled([err('#N/A')], [{ rows: [[1]] }], 1)).toBe(false);
    expect(settled([{ rows: [[1, 2]] }], [{ rows: [[1, 2.01]] }], 0.05)).toBe(true);
    expect(settled([{ rows: [[1, 2]] }], [{ rows: [[1]] }], 0.05)).toBe(false);
    expect(settled([{ rows: [[1]] }], [{ rows: [[1], [2]] }], 0.05)).toBe(false);
  });
});
