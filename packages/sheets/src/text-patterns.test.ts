// Smart Fill's patterns (docs/specs/029-sheets/grid-and-editing.md "Fill and move", D149).
import { describe, expect, it } from 'vitest';
import {
  TEXT_PATTERN_SEARCH_MAX,
  learnTextPattern,
  runTextPattern,
  takeText,
  type TextPattern,
} from './text-patterns';

const ex = (sources: string[], output: string) => ({ sources, output });
const learn = (...examples: ReturnType<typeof ex>[]) => learnTextPattern(examples);
const run = (p: TextPattern | null, ...sources: string[]) => runTextPattern(p!, sources);

describe('learnTextPattern', () => {
  it('joins two sources with fixed text', () => {
    const p = learn(ex(['Ada', 'Lovelace'], 'Ada Lovelace'), ex(['Alan', 'Turing'], 'Alan Turing'));
    expect(run(p, 'Grace', 'Hopper')).toBe('Grace Hopper');
  });

  it('takes the first word, and the last counted from the end', () => {
    const first = learn(ex(['Ada King Lovelace'], 'Ada'), ex(['Alan Turing'], 'Alan'));
    expect(run(first, 'Grace B Hopper')).toBe('Grace');
    const last = learn(ex(['Ada King Lovelace'], 'Lovelace'), ex(['Alan Turing'], 'Turing'));
    expect(run(last, 'Grace B Hopper')).toBe('Hopper');
  });

  it('builds an email in lower case from names, with fixed text after', () => {
    const p = learn(
      ex(['Ada', 'Lovelace'], 'ada.lovelace@example.com'),
      ex(['Alan', 'Turing'], 'alan.turing@example.com'),
    );
    expect(run(p, 'Grace', 'Hopper')).toBe('grace.hopper@example.com');
  });

  it('reads what lies after or before a mark, and in upper or title case', () => {
    const domain = learn(
      ex(['ada@math.org'], 'math.org'),
      ex(['alan@bletchley.uk'], 'bletchley.uk'),
    );
    expect(run(domain, 'grace@navy.mil')).toBe('navy.mil');
    const user = learn(ex(['ada@math.org'], 'ADA'), ex(['alan@bletchley.uk'], 'ALAN'));
    expect(run(user, 'grace@navy.mil')).toBe('GRACE');
    const title = learn(ex(['ada lovelace'], 'Ada Lovelace'), ex(['alan turing'], 'Alan Turing'));
    expect(run(title, 'grace hopper')).toBe('Grace Hopper');
  });

  it('makes initials from words and first letters', () => {
    const p = learn(
      ex(['Ada', 'Lovelace'], 'A. Lovelace'),
      ex(['Charles', 'Babbage'], 'C. Babbage'),
    );
    expect(run(p, 'Grace', 'Hopper')).toBe('G. Hopper');
    const both = learn(ex(['Ada Lovelace'], 'AL'), ex(['Grace Hopper'], 'GH'));
    expect(run(both, 'Alan Turing')).toBe('AT');
  });

  it('finds nothing when no pattern gives every example', () => {
    expect(learn(ex(['Ada'], 'x1'), ex(['Alan'], 'y2'))).toBeNull();
    expect(learn()).toBeNull();
    expect(learn(ex(['a'], 'abX'), ex(['a'], 'abY'))).toBeNull();
    // A row with fewer sources than the first reads the missing ones as empty.
    expect(learn(ex(['Ada', 'L'], 'L'), ex(['Bo'], 'x'))).toBeNull();
    expect(run(learn(ex(['a', 'Ada'], 'Ada'), ex(['b', 'Bo'], 'Bo')), 'c')).toBeNull();
  });

  it('checks the examples past those it searched', () => {
    const p = learn(ex(['a'], 'a'), ex(['b'], 'b'), ex(['c'], 'c'), ex(['d'], 'd'), ex(['e'], 'E'));
    expect(p).toBeNull();
  });

  it('gives up past its search budget', () => {
    const examples = [
      ex(['Ada', 'Lovelace'], 'Ada Lovelace'),
      ex(['Alan', 'Turing'], 'Alan Turing'),
    ];
    expect(learnTextPattern(examples, 3)).toBeNull();
    expect(learnTextPattern(examples, TEXT_PATTERN_SEARCH_MAX)).not.toBeNull();
  });
});

describe('runTextPattern', () => {
  it('gives null for a row missing the word or mark, or an empty piece', () => {
    const p = learn(ex(['ada@math.org'], 'math.org'), ex(['alan@x.uk'], 'x.uk'));
    expect(run(p, 'no mark here')).toBeNull();
    const word = learn(ex(['a b c'], 'c'), ex(['d e f'], 'f'));
    expect(run(word, 'single')).toBeNull();
    expect(run(learn(ex(['Ada', 'X'], 'Ada'), ex(['Bo', 'Y'], 'Bo')), '', 'Z')).toBeNull();
  });
});

describe('takeText', () => {
  it('takes each piece of a text', () => {
    const t = 'one-two-three';
    const take = (over: Partial<Parameters<typeof takeText>[0]>) =>
      takeText({ src: 0, kind: 'whole', mark: '', at: 0, case: 'same', ...over }, t);
    expect(take({ kind: 'word', mark: '-', at: 1 })).toBe('two');
    expect(take({ kind: 'word', mark: '-', at: -1 })).toBe('three');
    expect(take({ kind: 'word', mark: '-', at: 5 })).toBeNull();
    expect(take({ kind: 'before', mark: '-', at: 0 })).toBe('one');
    expect(take({ kind: 'before', mark: '-', at: -1 })).toBe('one-two');
    expect(take({ kind: 'after', mark: '-', at: 0 })).toBe('two-three');
    expect(take({ kind: 'after', mark: '-', at: -1 })).toBe('three');
    expect(take({ kind: 'after', mark: '@', at: 0 })).toBeNull();
    const initial = (at: number) =>
      takeText({ src: 0, kind: 'initial', mark: ' ', at, case: 'same' }, 'one two three');
    expect(initial(-2)).toBe('t');
    expect(initial(3)).toBeNull();
    expect(take({ kind: 'first' })).toBe('o');
    expect(take({ kind: 'whole', case: 'upper' })).toBe('ONE-TWO-THREE');
    expect(takeText({ src: 1, kind: 'first', mark: '', at: 0, case: 'same' }, '')).toBeNull();
  });
});
