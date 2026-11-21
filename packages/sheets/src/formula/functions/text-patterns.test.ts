// The patterns text functions search with (formulas.md "Functions": the cost bound; "Text": the RE2 bullets).
import { describe, expect, it } from 'vitest';
import { RE2_CACHE_MAX } from '../../limits';
import { re2, regex, wildcardSource } from './text-patterns';

describe('regex', () => {
  it('compiles a JavaScript pattern, or says it is not one', () => {
    expect(regex('a+', 'aa')).toBeInstanceOf(RegExp);
    expect(regex('(', 'a')).toMatchObject({ e: '#VALUE!' });
  });
});

describe('re2', () => {
  it('compiles a fresh RegExp each call, global when asked', () => {
    const one = re2('REGEXMATCH', 'a', 'a');
    const two = re2('REGEXREPLACE', 'a', 'a', true);
    expect(one).toMatchObject({ groups: 0 });
    expect('re' in one && one.re.flags).toBe('u');
    expect('re' in two && two.re.flags).toBe('gu');
    expect('re' in one && 're' in two && one.re !== two.re).toBe(true);
  });

  it('refuses in Google words, naming the function', () => {
    expect(re2('REGEXEXTRACT', '(?=a)', 'a')).toEqual({
      e: '#REF!',
      why: 'Function REGEXEXTRACT parameter 2 value "(?=a)" is not a valid regular expression.',
    });
  });

  it('keeps answering past its cache of translations', () => {
    for (let i = 0; i <= RE2_CACHE_MAX; i++) re2('REGEXMATCH', `x${i}`, '');
    expect(re2('REGEXMATCH', 'x0', 'x0')).toMatchObject({ groups: 0 });
  });

  it('bounds the work of the pattern it writes', () => {
    expect(re2('REGEXMATCH', '(a+)+$', 'a'.repeat(40))).toMatchObject({ e: '#VALUE!' });
  });
});

describe('wildcardSource', () => {
  it.each([
    ['a*b', 'a[\\s\\S]*b'],
    ['a?', 'a[\\s\\S]'],
    ['~*~?~~', '\\*\\?~'],
    ['a.b~', 'a\\.b~'],
  ])('%j reads as %j', (pattern, source) => {
    expect(wildcardSource(pattern)).toBe(source);
  });
});
