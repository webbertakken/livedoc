// docs/specs/029-sheets/data-tools.md "Slicers": a slicer shows its title, else its column's name, and what it keeps.
import { describe, expect, it } from 'vitest';
import { slicerHeading, slicerKeeps } from './slicer-summary';

describe('slicerKeeps', () => {
  it('reads All with nothing filtered', () => {
    expect(slicerKeeps(null, 5)).toBe('All');
    expect(slicerKeeps({}, 5)).toBe('All');
  });

  it('counts the values kept against the column’s', () => {
    expect(slicerKeeps({ values: ['a', 'b', 'c'] }, 5)).toBe('3 of 5');
  });

  it('reads a condition in its words, before any values', () => {
    expect(slicerKeeps({ op: 'gt', a: '2' }, 5)).toBe('Greater than 2');
    expect(slicerKeeps({ op: 'between', a: '1', b: '4', values: ['x'] }, 5)).toBe(
      'Is between 1 and 4',
    );
    expect(slicerKeeps({ op: 'empty' }, 5)).toBe('Is empty');
    expect(slicerKeeps({ op: 'dateOn', d: 'pastWeek' }, 5)).toBe('Date is in the past week');
  });
});

describe('slicerHeading', () => {
  it('is the title, else the column’s name', () => {
    expect(slicerHeading('Items', 'Item')).toBe('Items');
    expect(slicerHeading('  ', 'Item')).toBe('Item');
    expect(slicerHeading(undefined, 'Item')).toBe('Item');
  });
});
