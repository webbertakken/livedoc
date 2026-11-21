// Google's replacement syntax for REGEXREPLACE (formulas.md "Text", D70).
import { describe, expect, it } from 'vitest';
import { applyReplacement, parseReplacement } from './re2-replace';

const apply = (text: string, groups: number, match: (string | undefined)[]) => {
  const parts = parseReplacement(text, groups);
  if ('missing' in parts) throw new Error(`missing ${parts.missing}`);
  return applyReplacement(parts, match);
};

describe('parseReplacement', () => {
  const m = ['abc', 'a', 'b'];
  it.each([
    ['x', 0, 'x'],
    ['', 0, ''],
    ['[$0]', 0, '[abc]'],
    ['$2$1', 2, 'ba'],
    ['$12', 2, 'a2'],
    ['$01', 2, 'a'],
    ['$', 0, '$'],
    ['$x', 0, '$x'],
    ['${1}', 2, '${1}'],
    ['\\$1', 2, '$1'],
    ['\\\\', 0, '\\'],
    ['\\n', 0, 'n'],
    ['a\\', 0, 'a\\'],
  ])('%j with %i groups writes %j', (text, groups, out) => {
    expect(apply(text, groups, m.slice(0, groups + 1))).toBe(out);
  });

  it('reads the longest number that still names a group', () => {
    const match = Array.from({ length: 13 }, (_, i) => `g${i}`);
    expect(apply('$12', 12, match)).toBe('g12');
    expect(apply('$123', 12, match)).toBe('g123');
  });

  it('names the first group the pattern lacks', () => {
    expect(parseReplacement('$1', 0)).toEqual({ missing: 1 });
    expect(parseReplacement('$0 $3', 2)).toEqual({ missing: 3 });
  });

  it('writes a group that took no part as empty text', () => {
    expect(apply('<$1>', 1, ['x', undefined])).toBe('<>');
  });
});
