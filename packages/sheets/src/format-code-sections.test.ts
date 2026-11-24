// formatting.md "Number formats": a code's sections, conditions (D191) and colours (D192), its currency brackets, and
// why a code cannot be read.
import { describe, expect, it } from 'vitest';
import { CODE_COLOURS, formatCodeDraw, formatCodeProblem, formatCodeText } from './format-codes';
import { displayValue } from './number-format';
import { FORMAT_CODE_MAX } from './limits';

describe('a code with colours', () => {
  it('draws a section in its colour, any case, and the rest in none', () => {
    expect(formatCodeDraw(-5, '0;[Red]-0')).toEqual({ text: '-5', colour: CODE_COLOURS.red });
    expect(formatCodeDraw(5, '0;[Red]-0')).toEqual({ text: '5' });
    expect(formatCodeDraw(5, '[BLUE]0')).toEqual({ text: '5', colour: '#0000FF' });
    expect(formatCodeDraw('a', '0;0;0;[green]@')).toEqual({ text: 'a', colour: '#00FF00' });
    // A digit in a text section draws nothing.
    expect(formatCodeText('a', '0;0;0;0@')).toBe('a');
    expect(Object.keys(CODE_COLOURS)).toEqual([
      'black',
      'white',
      'red',
      'green',
      'blue',
      'yellow',
      'magenta',
      'cyan',
    ]);
  });

  it('gives TEXT the section, never the colour', () => {
    expect(formatCodeText(-5, '0;[Red](0)')).toBe('(5)');
  });
});

describe('a code with conditions (D191)', () => {
  it('draws the first section whose condition holds, the number keeping its minus', () => {
    const code = '[<0][Red]0.0;[>=1000]#,##0,"K";0';
    expect(formatCodeDraw(-2, code)).toEqual({ text: '-2.0', colour: CODE_COLOURS.red });
    expect(formatCodeText(25_000, code)).toBe('25K');
    expect(formatCodeText(12, code)).toBe('12');
  });

  it('reads every comparison, with decimals and negatives', () => {
    expect(formatCodeText(1, '[=1]"one";"other"')).toBe('one');
    expect(formatCodeText(2, '[=1]"one";"other"')).toBe('other');
    expect(formatCodeText(0, '[<>0]"some";"none"')).toBe('none');
    expect(formatCodeText(0.5, '[<=0.5]"low";"high"')).toBe('low');
    expect(formatCodeText(-3, '[>-2.5]"near";"far"')).toBe('far');
    expect(formatCodeText(3, '[>2]"big"')).toBe('big');
  });

  it('draws a number no section takes as Automatic', () => {
    expect(formatCodeText(5, '[<0]0;[>10]0')).toBe('5');
  });
});

describe('a date section', () => {
  it('draws a negative in its own section as its size, and in the only one as it is', () => {
    expect(formatCodeText(-1, '0;[Blue]yyyy')).toBe('1899');
    expect(formatCodeDraw(-1, '0;[Blue]yyyy').colour).toBe('#0000FF');
    expect(formatCodeText(-400, 'dd/mm/yyyy')).toBe('25/11/1898');
  });

  it('draws an unclosed bracket as it reads, never failing', () => {
    expect(formatCodeDraw(1, '0[Red')).toEqual({ text: '1' });
  });
});

describe('a currency in brackets', () => {
  it('draws its symbol, with or without a locale', () => {
    expect(formatCodeText(1234.5, '[$€-407]#,##0.00')).toBe('€1,234.50');
    expect(formatCodeText(3, '[$USD] 0')).toBe('USD 3');
  });
});

describe('formatCodeProblem', () => {
  it('says why a code cannot be read', () => {
    expect(formatCodeProblem('0.00')).toBeNull();
    expect(formatCodeProblem('[Red][<0]0;0')).toBeNull();
    expect(formatCodeProblem('[h]:mm')).toBeNull();
    // An Excel palette colour is read past, never refused.
    expect(formatCodeProblem('[Color10]0')).toBeNull();
    expect(formatCodeDraw(1, '[Color10]0')).toEqual({ text: '1' });
    expect(formatCodeProblem('  ')).toBe('Enter a format');
    expect(formatCodeProblem('x'.repeat(FORMAT_CODE_MAX + 1))).toBe(
      `Longer than ${FORMAT_CODE_MAX} characters`,
    );
    expect(formatCodeProblem('[Red0')).toBe('`[` is not closed');
    expect(formatCodeProblem('0]')).toBe('`]` has no `[`');
    expect(formatCodeProblem('"open')).toBe('`"` is not closed');
    expect(formatCodeProblem('0;0;0;0;0')).toBe('More than four sections');
    expect(formatCodeProblem('[Purple]0')).toBe('`[Purple]` is not a colour or a condition');
    expect(formatCodeProblem('[[h]]')).toBe('`[` is not closed');
  });
});

describe('a Custom format drawn', () => {
  it('carries its colour to the grid', () => {
    expect(displayValue(-1, { nf: 'custom', nc: '0;[Red]0' }, 'en-GB')).toMatchObject({
      text: '1',
      colour: CODE_COLOURS.red,
    });
    expect(displayValue('t', { nf: 'custom', nc: '[Cyan]@' }, 'en-GB').colour).toBe('#00FFFF');
    expect(displayValue(1, { nf: 'custom', nc: '0' }, 'en-GB')).not.toHaveProperty('colour');
  });
});
