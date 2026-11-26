// review.md "Compare documents" ("What is compared": the longest common reading kept; "Bounded").
import { describe, expect, it } from 'vitest';
import { diffSequences, type DiffOp } from './compare-diff';

const same = (a: string, b: string) => a === b;
const chars = (s: string) => [...s];

/** The ops read back as each side: the kept and deleted are the first, the kept and inserted the second. */
function sides(a: string[], b: string[], ops: readonly DiffOp[]): [string, string] {
  let first = '';
  let second = '';
  for (const op of ops) {
    if (op.kind !== 'insert') first += a[op.a];
    if (op.kind !== 'delete') second += b[op.b];
  }
  return [first, second];
}

const kept = (ops: readonly DiffOp[]) => ops.filter((op) => op.kind === 'same').length;

describe('diffSequences', () => {
  it('keeps two equal sequences whole', () => {
    const ops = diffSequences(chars('abc'), chars('abc'), same, 100);
    expect(ops.map((op) => op.kind)).toEqual(['same', 'same', 'same']);
  });

  it('deletes and inserts wholly when nothing is common', () => {
    const ops = diffSequences(chars('ab'), chars('xy'), same, 100);
    expect(kept(ops)).toBe(0);
    expect(sides(chars('ab'), chars('xy'), ops)).toEqual(['ab', 'xy']);
  });

  it('handles an empty side', () => {
    expect(diffSequences([], chars('ab'), same, 100).map((op) => op.kind)).toEqual([
      'insert',
      'insert',
    ]);
    expect(diffSequences(chars('ab'), [], same, 100).map((op) => op.kind)).toEqual([
      'delete',
      'delete',
    ]);
    expect(diffSequences([], [], same, 100)).toEqual([]);
  });

  it('finds the longest common reading in between', () => {
    const a = chars('ABCABBA');
    const b = chars('CBABAC');
    const ops = diffSequences(a, b, same, 100);
    expect(kept(ops)).toBe(4);
    expect(sides(a, b, ops)).toEqual(['ABCABBA', 'CBABAC']);
  });

  it('puts a stretch’s deletions before its insertions', () => {
    const ops = diffSequences(chars('axc'), chars('ayc'), same, 100);
    expect(ops.map((op) => op.kind)).toEqual(['same', 'delete', 'insert', 'same']);
  });

  it('keeps the common start and end when past the bound', () => {
    const a = chars('start-abcdefgh-end');
    const b = chars('start-ijklmnop-end');
    const ops = diffSequences(a, b, same, 2);
    expect(sides(a, b, ops)).toEqual(['start-abcdefgh-end', 'start-ijklmnop-end']);
    expect(kept(ops)).toBe(10);
  });

  it('uses the sameness it is given', () => {
    const ops = diffSequences(['A'], ['a'], (x, y) => x.toLowerCase() === y.toLowerCase(), 10);
    expect(ops).toEqual([{ kind: 'same', a: 0, b: 0 }]);
  });
});
