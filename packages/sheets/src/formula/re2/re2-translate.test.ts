// RE2 patterns as JavaScript (formulas.md "Text": the RE2 bullets), held by what each matches.
import { describe, expect, it } from 'vitest';
import { RE2_COUNT_MAX, translateRe2 } from './re2-translate';

function match(pattern: string, text: string): string | null {
  const t = translateRe2(pattern);
  if ('why' in t) throw new Error(`refused ${pattern}: ${t.why}`);
  return new RegExp(t.source, 'u').exec(text)?.[0] ?? null;
}

const groupsOf = (pattern: string): number => {
  const t = translateRe2(pattern);
  return 'groups' in t ? t.groups : -1;
};

describe('translateRe2', () => {
  it.each([
    // RE2's meanings: ASCII Perl classes, `.` short of \n alone.
    ['\\s+', 'a\u00a0\t\n b', '\t\n '],
    ['\\s', '\u000b', null],
    ['\\d+', '١٢3', '3'],
    ['\\w+', 'éab_1', 'ab_1'],
    ['\\D', '1x', 'x'],
    ['\\S', ' y', 'y'],
    ['\\W', 'a-', '-'],
    ['a.b', 'a\rb', 'a\rb'],
    ['a.b', 'a\nb', null],
    ['(?s)a.b', 'a\nb', 'a\nb'],
    ['\\bcat\\b', 'a cat!', 'cat'],
    ['\\Bat', 'cat', 'at'],
    // Lines: ^ and $ at \n only under (?m), else the text's ends.
    ['^b', 'a\nb', null],
    ['(?m)^b$', 'a\nb\nc', 'b'],
    ['(?m)a$', 'a\r\nb', null],
    ['\\Aa', 'ba', null],
    ['a\\z', 'a\n', null],
    ['b\\z', 'ab', 'b'],
    // Flags: set, cleared, scoped, and held to the end of their group.
    ['(?i)abc', 'xABc', 'ABc'],
    ['(?i)k', '\u212a', '\u212a'],
    ['(?i)\u212a', 'k', 'k'],
    ['(?i)ſ', 'S', 'S'],
    ['(?i:a)b', 'AB', null],
    ['(?i:a)b', 'Ab', 'Ab'],
    ['(?i)a(?-i)b', 'AB', null],
    ['(?i)a(?-i:b)c', 'AbC', 'AbC'],
    ['(a(?i)b)c', 'aBC', null],
    ['(?i)x|y', 'Y', 'Y'],
    ['(?i)[a-c]+', 'xBCa', 'BCa'],
    ['(?i)[^k]', '\u212a', null],
    ['(?i)\\W', '\u212a', null],
    ['(?i)[[:upper:]]', 'a', 'a'],
    ['(?i)1', '1', '1'],
    ['(?U)a+', 'aaa', 'a'],
    ['(?U)a+?', 'aaa', 'aaa'],
    ['(?ms)^.$', 'x\n\ny', 'x'],
    ['(?ms)\n^.$', 'x\n\ny', '\ny'],
    // RE2's own syntax: quoting, ASCII classes, escapes, counts.
    ['\\Qa.b\\E', 'axb a.b', 'a.b'],
    ['\\Qa+', 'a+', 'a+'],
    ['\\Q\\E', 'z', ''],
    ['x\\Q\\E*', 'xx', 'xx'],
    ['[[:alpha:]]+', '12ab3', 'ab'],
    ['[[:^digit:]]+', '12ab3', 'ab'],
    ['[[:punct:][:space:]]+', 'a!? b', '!? '],
    ['[\\d.]+', 'x1.5', '1.5'],
    ['[\\d-z]+', 'a-z1', '-z1'],
    ['[^\\D]', 'a1', '1'],
    ['[]a]+', ']a', ']a'],
    ['[^]a]', ']ab', 'b'],
    ['[a-]+', '-a', '-a'],
    ['[[a]+', '[a', '[a'],
    ['[\\x41-\\x{43}]+', 'ABCD', 'ABC'],
    ['\\x41\\x{1F600}', 'A😀', 'A😀'],
    ['\\101\\0\\12', 'A\u0000\n', 'A\u0000\n'],
    ['\\07', '\u0007', '\u0007'],
    ['\\17', '\u000f', '\u000f'],
    ['\\a\\f\\t\\n\\r\\v', '\u0007\f\t\n\r\u000b', '\u0007\f\t\n\r\u000b'],
    ['\\.\\*\\ \\_', '.* _', '.* _'],
    ['a{2}', 'aaa', 'aa'],
    ['a{2,}', 'aaa', 'aaa'],
    ['a{1,2}?', 'aa', 'a'],
    ['a{,2}', 'a{,2}', 'a{,2}'],
    ['{', '{', '{'],
    ['a{x}', 'a{x}', 'a{x}'],
    ['}]/', '}]/', '}]/'],
    ['😀+', '😀😀', '😀😀'],
    ['^*a', 'a', 'a'],
    ['\\b+a', 'a', 'a'],
    ['(?P<year>\\d{4})-(?<m>\\d\\d)', '2026-11', '2026-11'],
    ['(?:ab)+', 'abab', 'abab'],
    ['a|', 'b', ''],
    ['()', 'x', ''],
    ['', 'x', ''],
  ])('%j finds %j as %j', (pattern, text, found) => {
    expect(match(pattern, text)).toBe(found);
  });

  it('counts capture groups, named ones too, and not the others', () => {
    expect(groupsOf('(a)(?P<n>b)(?<m>c)(?:d)(?i)(?s:e)')).toBe(3);
    expect(groupsOf('((a)|(b))')).toBe(3);
  });

  it('applies a repeat after a flag group to the atom before it, as RE2 does', () => {
    expect(match('a(?i)*', 'aaa')).toBe('aaa');
  });

  it.each([
    ['(?=a)', 'lookahead'],
    ['(?!a)', 'negative lookahead'],
    ['(?<=a)b', 'lookbehind'],
    ['(?<!a)b', 'negative lookbehind'],
    ['(a)\\1', 'backreference'],
    ['(?P<n>a)(?P=n)', 'named backreference'],
    ['(?P>n)', 'recursion'],
    ['(?>a)', 'atomic group'],
    ['a*+', 'possessive'],
    ['a++', 'possessive'],
    ['a**', 'repeat of a repeat'],
    ['a{2}{3}', 'repeat of a count'],
    ['a???', 'repeat of a lazy repeat'],
    ['(?#note)', 'comment'],
    ['(?|a|b)', 'branch reset'],
    ['(?)', 'no flags'],
    ['(?-)', 'no flags cleared'],
    ['(?i-)', 'nothing after -'],
    ['(?x)', 'unknown flag'],
    ['(?<1a)', 'bad name'],
    ['(?P<>a)', 'empty name'],
    ['(?P<n>a)(?P<n>b)', 'duplicate name'],
    ['*a', 'nothing to repeat'],
    ['a|*', 'nothing to repeat after |'],
    ['(*)', 'nothing to repeat in a group'],
    ['{2}', 'a count of nothing'],
    ['(?i)*', 'a repeat of a flag group alone'],
    ['a{1001}', 'count past 1,000'],
    ['a{2,1001}', 'count past 1,000'],
    ['a{3,2}', 'reversed count'],
    ['(a{2}){501}', 'nested counts past 1,000'],
    ['\\pL', 'Unicode class'],
    ['\\p{Greek}', 'Unicode class'],
    ['[\\PL]', 'Unicode class in a class'],
    ['\\Z', '\\Z'],
    ['\\G', '\\G'],
    ['\\C', 'single byte'],
    ['\\cK', 'control escape'],
    ['\\e', 'escape'],
    ['\\E', '\\E alone'],
    ['\\é', 'non-ASCII escape'],
    ['\\8', 'not octal'],
    ['\\18', 'one octal digit, then not one'],
    ['\\7', 'a backreference, one digit alone'],
    ['\\x4', 'one hex digit'],
    ['\\x{110000}', 'past the last code point'],
    ['\\x{}', 'empty hex'],
    ['a\\', 'trailing backslash'],
    ['(a', 'missing )'],
    ['a)', 'unexpected )'],
    ['[a', 'missing ]'],
    ['[]', 'missing ] after a first ]'],
    ['[z-a]', 'reversed range'],
    ['[a-\\d]', 'class as a range end'],
    ['[\\b]', 'backspace in a class'],
    ['[\\Q]\\E]', 'quoting in a class'],
    ['[[:foo:]]', 'unknown ASCII class'],
  ])('refuses %j (%s)', (pattern) => {
    expect(translateRe2(pattern)).toHaveProperty('why');
  });

  it('holds nested counts to their product, as RE2 does', () => {
    expect(translateRe2(`(a{${RE2_COUNT_MAX / 10}}){10}`)).toHaveProperty('source');
    expect(translateRe2('((a{10}){10}){11}')).toHaveProperty('why');
    expect(translateRe2('(a{0}){1000}')).toHaveProperty('source');
    expect(translateRe2('(a{2,}){500}')).toHaveProperty('source');
    expect(translateRe2('(a*|b{2}){501}')).toHaveProperty('why');
  });

  it('rethrows what is not a refusal', () => {
    const at = String.prototype.codePointAt;
    String.prototype.codePointAt = () => {
      throw new TypeError('boom');
    };
    try {
      expect(() => translateRe2('a')).toThrow('boom');
    } finally {
      String.prototype.codePointAt = at;
    }
  });
});
