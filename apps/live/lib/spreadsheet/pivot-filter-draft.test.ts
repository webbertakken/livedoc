// A pivot table filter's Filter by Condition in the editor (docs/specs/029-sheets/pivot-tables.md "Pivot Table
// Editor", D622): the draft a filter opens with, and the filter a draft writes, its ticked items kept.
import { describe, expect, it } from 'vitest';
import { draftOfPivotFilter, pivotFilterOfDraft } from './pivot-filter-draft';

const draft = (over: object) => ({ op: '', a: '', b: '', d: '', fx: '=', ...over }) as const;

describe('a pivot filter’s condition draft', () => {
  it('opens on its condition, its formula as Custom formula is, or none', () => {
    expect(draftOfPivotFilter({ col: 'c', cond: { values: ['x'], op: 'gt', a: '5' } })).toEqual(
      draft({ op: 'gt', a: '5' }),
    );
    expect(draftOfPivotFilter({ col: 'c', formula: '=Units>8' })).toEqual(
      draft({ op: 'formula', fx: '=Units>8' }),
    );
    expect(draftOfPivotFilter({ col: 'c', cond: {} })).toEqual(draft({}));
    // A period from a file reads as an exact date: the editor offers none.
    expect(draftOfPivotFilter({ col: 'c', cond: { op: 'dateOn', d: 'today' } })).toEqual(
      draft({ op: 'dateOn' }),
    );
  });

  it('writes a condition beside the ticked items, a formula in their place, none as the items alone', () => {
    const ticked = { col: 'c', cond: { values: ['East'] } };
    expect(pivotFilterOfDraft(ticked, draft({ op: 'between', a: '1', b: '9' }))).toEqual({
      col: 'c',
      cond: { values: ['East'], op: 'between', a: '1', b: '9' },
    });
    expect(pivotFilterOfDraft(ticked, draft({ op: 'notEmpty', a: 'stale' }))).toEqual({
      col: 'c',
      cond: { values: ['East'], op: 'notEmpty' },
    });
    expect(pivotFilterOfDraft(ticked, draft({ op: 'formula', fx: ' Units>8 ' }))).toEqual({
      col: 'c',
      formula: '=Units>8',
    });
    expect(pivotFilterOfDraft({ col: 'c', cond: { op: 'gt', a: '1' } }, draft({}))).toEqual({
      col: 'c',
      cond: {},
    });
    expect(pivotFilterOfDraft({ col: 'c', formula: '=1' }, draft({ op: 'empty' }))).toEqual({
      col: 'c',
      cond: { op: 'empty' },
    });
  });

  it('leaves an empty Custom formula is unwritten', () => {
    for (const fx of ['', '=', '  = '])
      expect(pivotFilterOfDraft({ col: 'c', cond: {} }, draft({ op: 'formula', fx }))).toBeNull();
  });
});
