import { describe, expect, it } from 'vitest';
import { cutAtWord } from './cut-at-word';
import { ACTION_NAME_MAX, actionNameOf } from './element-action';

describe('cutAtWord', () => {
  it('keeps a first line within the most whole', () => {
    expect(cutAtWord('  Check the totals \nand the dates', 100)).toBe('Check the totals');
  });

  it('cuts past the most at the last word, with an ellipsis', () => {
    const cut = cutAtWord(`${'word '.repeat(60)}end`, 20);
    expect(cut).toBe('word word word…');
    expect(cut.length).toBeLessThanOrEqual(20);
  });

  it('cuts a line with no space at the most', () => {
    expect(cutAtWord('x'.repeat(30), 10)).toBe(`${'x'.repeat(9)}…`);
  });

  it('reads Windows line ends as line ends', () => {
    expect(cutAtWord('one\r\ntwo', 10)).toBe('one');
  });
});

describe('actionNameOf', () => {
  it('takes the first line, cut at a word with an ellipsis past the most', () => {
    expect(actionNameOf('Check the totals\nand the dates')).toBe('Check the totals');
    const name = actionNameOf(`${'word '.repeat(60)}end`);
    expect(name.length).toBeLessThanOrEqual(ACTION_NAME_MAX);
    expect(name.endsWith('word…')).toBe(true);
    expect(actionNameOf('x'.repeat(300))).toHaveLength(ACTION_NAME_MAX);
  });
});
