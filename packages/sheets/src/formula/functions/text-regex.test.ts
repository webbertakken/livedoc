// The REGEX functions on RE2 patterns, in a sheet (formulas.md "Text": the RE2 bullets, D70).
import { describe, expect, it } from 'vitest';
import { calc } from '../../testing/book';

describe('REGEX functions', () => {
  it.each([
    ['=REGEXMATCH("a b", "a\\sb")', true],
    ['=REGEXMATCH("a" & CHAR(160) & "b", "a\\sb")', false],
    ['=REGEXMATCH("ABC", "(?i)abc")', true],
    ['=REGEXEXTRACT("price: $12", "\\Q$\\E(\\d+)")', '12'],
    ['=REGEXEXTRACT("ab12", "[[:digit:]]+")', '12'],
    ['=REGEXREPLACE("2026-11-21", "(\\d+)-(\\d+)-(\\d+)", "$3/$2/$1")', '21/11/2026'],
    ['=REGEXREPLACE("abc", "b", "[$0]")', 'a[b]c'],
    ['=REGEXREPLACE("abc", "(b)", "$12")', 'ab2c'],
    ['=REGEXREPLACE("abc", "b", "\\$1")', 'a$1c'],
    ['=REGEXREPLACE("abc", "x(y)", "$2")', 'abc'],
    ['=REGEXREPLACE("abc", "x*", "-")', '-a-b-c-'],
  ])('%s is %j', (f, v) => {
    expect(calc(f)).toBe(v);
  });

  it.each([
    ['=REGEXREPLACE("abc", "(b)", "$2")', '#N/A'],
    ['=REGEXREPLACE("abc", "b", "$")', '#N/A'],
    ['=REGEXMATCH("ab", "(?<=a)b")', '#REF!'],
    ['=REGEXEXTRACT("aa", "(a)\\1")', '#REF!'],
    ['=REGEXMATCH("a", "\\p{L}")', '#REF!'],
    ['=REGEXMATCH(1, "1")', '#VALUE!'],
  ])('%s is %s', (f, e) => {
    expect(calc(f)).toMatchObject({ e });
  });
});
