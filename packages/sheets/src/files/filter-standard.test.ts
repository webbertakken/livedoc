// docs/specs/029-sheets/standard-mapping.md "Filters in the file" (D477): the one mapping of a column's condition to
// the standard column both formats write, and back.
import { describe, expect, it } from 'vitest';
import { serialFromDate } from '../dates';
import type { FilterCondition } from '../sheet';
import {
  conditionOfStandard,
  standardColumnOf,
  standardLine,
  type StandardColumn,
} from './filter-standard';

const TODAY = serialFromDate(2026, 11, 27);
const std = (cond: FilterCondition) => standardColumnOf(cond, 'en-GB', TODAY);

describe('standardColumnOf', () => {
  it('writes kept values with the blank apart', () => {
    expect(std({ values: ['pen', '', 'cap'] })).toEqual({ values: ['pen', 'cap'], blank: true });
    expect(std({ values: ['pen'] })).toEqual({ values: ['pen'] });
  });

  it('writes a condition before kept values', () => {
    expect(std({ values: ['pen'], op: 'contains', a: 'p' })).toEqual({
      tests: [{ op: 'contains', v: 'p' }],
    });
  });

  it('writes the text tests and the empty tests', () => {
    expect(std({ op: 'startsWith', a: 'ab' })).toEqual({ tests: [{ op: 'begins', v: 'ab' }] });
    expect(std({ op: 'endsWith', a: 'ab' })).toEqual({ tests: [{ op: 'ends', v: 'ab' }] });
    expect(std({ op: 'notContains', a: 'x' })).toEqual({ tests: [{ op: 'notContains', v: 'x' }] });
    expect(std({ op: 'empty' })).toEqual({ tests: [{ op: 'empty', v: '' }] });
    expect(std({ op: 'notEmpty' })).toEqual({ tests: [{ op: 'notEmpty', v: '' }] });
  });

  it('writes Text Is Exactly as Is Equal To, and a number as its number', () => {
    expect(std({ op: 'exactly', a: 'Pen' })).toEqual({ tests: [{ op: 'eq', v: 'Pen' }] });
    expect(std({ op: 'neq', a: '0.50' })).toEqual({ tests: [{ op: 'neq', v: '0.5' }] });
    expect(std({ op: 'gt', a: '2.5' })).toEqual({ tests: [{ op: 'gt', v: '2.5' }] });
  });

  it('has no form for a comparison of text, a colour or a custom formula', () => {
    expect(std({ op: 'gt', a: 'abc' })).toBeNull();
    expect(std({ colour: { key: 'bg', is: '#ff0000' } })).toBeNull();
    expect(std({ op: 'between', a: '1', b: 'x' })).toBeNull();
  });

  it('writes Is Between and Is Not Between, the smaller first', () => {
    expect(std({ op: 'between', a: '9', b: '2' })).toEqual({
      tests: [
        { op: 'gte', v: '2' },
        { op: 'lte', v: '9' },
      ],
    });
    expect(std({ op: 'notBetween', a: '9', b: '2' })).toEqual({
      tests: [
        { op: 'lt', v: '2' },
        { op: 'gt', v: '9' },
      ],
      or: true,
    });
  });

  it('writes a date as its day number, a period from today', () => {
    const d = serialFromDate(2026, 3, 4);
    expect(std({ op: 'dateOn', a: '04/03/2026' })).toEqual({
      tests: [
        { op: 'gte', v: String(d) },
        { op: 'lt', v: String(d + 1) },
      ],
    });
    expect(std({ op: 'dateBefore', a: '04/03/2026' })).toEqual({
      tests: [{ op: 'lt', v: String(d) }],
    });
    expect(std({ op: 'dateAfter', a: '04/03/2026' })).toEqual({
      tests: [{ op: 'gte', v: String(d + 1) }],
    });
    expect(std({ op: 'dateOn', d: 'yesterday' })).toEqual({ day: 'yesterday', at: TODAY - 1 });
    expect(std({ op: 'dateOn', d: 'pastWeek' })).toEqual({
      tests: [
        { op: 'gte', v: String(TODAY - 7) },
        { op: 'lt', v: String(TODAY + 1) },
      ],
    });
    expect(std({ op: 'dateBefore', d: 'today' })).toEqual({
      tests: [{ op: 'lt', v: String(TODAY) }],
    });
    expect(std({ op: 'dateOn', a: 'soon' })).toBeNull();
  });
});

describe('conditionOfStandard', () => {
  const read = (s: StandardColumn) => conditionOfStandard(s);

  it('reads kept values, the blank as the empty text', () => {
    expect(read({ values: ['pen'], blank: true })).toEqual({ values: ['pen', ''] });
  });

  it('reads each single test as its condition', () => {
    expect(read({ tests: [{ op: 'begins', v: 'a' }] })).toEqual({ op: 'startsWith', a: 'a' });
    expect(read({ tests: [{ op: 'ends', v: 'a' }] })).toEqual({ op: 'endsWith', a: 'a' });
    expect(read({ tests: [{ op: 'empty', v: '' }] })).toEqual({ op: 'empty' });
    expect(read({ tests: [{ op: 'eq', v: 'Pen' }] })).toEqual({ op: 'eq', a: 'Pen' });
    expect(read({ tests: [{ op: 'lte', v: '3' }] })).toEqual({ op: 'lte', a: '3' });
    expect(read({ tests: [{ op: 'lte', v: 'x' }] })).toBeNull();
  });

  it('reads the pairs it has a condition for, and no other', () => {
    const t = (op: 'gte' | 'lte' | 'lt' | 'gt', v: string) => ({ op, v });
    expect(read({ tests: [t('gte', '2'), t('lte', '9')] })).toEqual({
      op: 'between',
      a: '2',
      b: '9',
    });
    expect(read({ tests: [t('gte', '46000'), t('lt', '46001')] })).toEqual({
      op: 'dateOn',
      a: '46000',
    });
    expect(read({ tests: [t('lt', '2'), t('gt', '9')], or: true })).toEqual({
      op: 'notBetween',
      a: '2',
      b: '9',
    });
    expect(read({ tests: [t('gte', '1'), t('lt', '9')] })).toBeNull();
    expect(read({ tests: [t('gte', '1'), t('lte', '9')], or: true })).toBeNull();
    expect(read({ tests: [] })).toBeNull();
  });

  it('reads a day as Date Is that day', () => {
    expect(read({ day: 'tomorrow' })).toEqual({ op: 'dateOn', d: 'tomorrow' });
  });

  it('round-trips every condition it writes to one that keeps the same rows', () => {
    const conds: FilterCondition[] = [
      { op: 'contains', a: 'x' },
      { op: 'between', a: '2', b: '9' },
      { op: 'notBetween', a: '2', b: '9' },
      { op: 'eq', a: '5' },
      { values: ['a', ''] },
      { op: 'dateOn', d: 'today' },
    ];
    for (const cond of conds) expect(read(std(cond)!), JSON.stringify(cond)).toEqual(cond);
  });
});

describe('standardLine', () => {
  it('says a column the same whatever order its keys were built in', () => {
    const a: StandardColumn = { tests: [{ op: 'lt', v: '1' }], or: true };
    const b = { or: true, tests: [{ v: '1', op: 'lt' }] } as StandardColumn;
    expect(standardLine(2, a)).toBe(standardLine(2, b));
    expect(standardLine(2, a)).not.toBe(standardLine(3, a));
  });
});
