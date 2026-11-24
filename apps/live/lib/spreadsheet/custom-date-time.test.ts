// formatting.md "Number formats": Custom Date and Time's parts, read from a code and written back (D197, D198).
import { describe, expect, it } from 'vitest';
import {
  DATE_BLOCKS,
  DATE_TIME_PRESETS,
  blockExample,
  dateCode,
  dateParts,
  dateTimeStart,
  type DatePart,
} from './custom-date-time';

const block = (b: DatePart & { kind: 'block' }) => b;

describe('dateParts', () => {
  it('reads a date code into blocks and the text between', () => {
    expect(dateParts('dd/mm/yyyy')).toEqual([
      { kind: 'block', block: 'day', token: 'dd' },
      { kind: 'text', text: '/' },
      { kind: 'block', block: 'month', token: 'mm' },
      { kind: 'text', text: '/' },
      { kind: 'block', block: 'year', token: 'yyyy' },
    ]);
  });

  it('reads Minute by its neighbours, AM/PM in any case, quoted and escaped text', () => {
    expect(dateParts('h:mm AM/PM')).toEqual([
      { kind: 'block', block: 'hour', token: 'h' },
      { kind: 'text', text: ':' },
      { kind: 'block', block: 'minute', token: 'mm' },
      { kind: 'text', text: ' ' },
      { kind: 'block', block: 'ampm', token: 'AM/PM' },
    ]);
    expect(dateParts('mm:ss')![0]).toEqual({ kind: 'block', block: 'minute', token: 'mm' });
    expect(dateParts('a/p')![0]).toEqual({ kind: 'block', block: 'ampm', token: 'A/P' });
    expect(dateParts('"Day "d\\!')).toEqual([
      { kind: 'text', text: 'Day ' },
      { kind: 'block', block: 'day', token: 'd' },
      { kind: 'text', text: '!' },
    ]);
  });

  it('reads no code without a block, with a bracket, a fraction of a second or two sections', () => {
    for (const code of ['0.00', '"x"', '[h]:mm', '[Red]dd', 'hh:mm:ss.00', 'dd;mm', '"open'])
      expect(dateParts(code), code).toBeNull();
  });
});

describe('dateCode', () => {
  it('writes separators bare and other text quoted, merging neighbours', () => {
    expect(
      dateCode([
        { kind: 'text', text: 'On ' },
        { kind: 'text', text: 'the ' },
        block({ kind: 'block', block: 'day', token: 'dddd' }),
        { kind: 'text', text: ', ' },
        block({ kind: 'block', block: 'month', token: 'mmm' }),
        { kind: 'text', text: '' },
        { kind: 'text', text: 'say "hi"' },
      ]),
    ).toBe('"On the "dddd, mmm"say \\"hi\\""');
  });

  it('round-trips every preset (D198)', () => {
    expect(DATE_TIME_PRESETS).toHaveLength(9);
    for (const code of DATE_TIME_PRESETS) expect(dateCode(dateParts(code)!), code).toBe(code);
  });
});

describe('dateTimeStart', () => {
  it('starts from the cell’s date code, else Date’s in the locale', () => {
    expect(dateCode(dateTimeStart({ nf: 'custom', nc: 'mmmm yyyy' }, 'en-GB'))).toBe('mmmm yyyy');
    expect(dateCode(dateTimeStart({ nf: 'time' }, 'en-GB'))).toBe('hh:mm:ss');
    expect(dateCode(dateTimeStart({ nf: 'number' }, 'en-GB'))).toBe('dd/mm/yyyy');
    expect(dateCode(dateTimeStart(undefined, 'en-US'))).toBe('mm/dd/yyyy');
  });
});

describe('the blocks (D197)', () => {
  it('lists each block’s tokens, each drawn from 26 September 2008 15:59:00', () => {
    expect(Object.keys(DATE_BLOCKS)).toEqual([
      'day',
      'month',
      'year',
      'hour',
      'minute',
      'second',
      'ampm',
    ]);
    expect(DATE_BLOCKS.month.tokens).toEqual(['m', 'mm', 'mmm', 'mmmm', 'mmmmm']);
    expect(DATE_BLOCKS.day.tokens.map((t) => blockExample('day', t))).toEqual([
      '26',
      '26',
      'Fri',
      'Friday',
    ]);
    expect(blockExample('month', 'mmmmm')).toBe('S');
    expect(blockExample('minute', 'mm')).toBe('59');
    expect(blockExample('hour', 'h')).toBe('15');
    expect(blockExample('ampm', 'AM/PM')).toBe('PM');
  });
});
