import { describe, expect, it } from 'vitest';
import {
  CONDITION_CHOICES,
  CONDITION_LABELS,
  FORMULA_UNREADABLE,
  conditionDraftOf,
  conditionOfDraft,
  takesValue,
  type ConditionDraft,
} from './filter-condition-draft';

// docs/specs/029-sheets/data-tools.md "Filters, filter views and slicers": Filter by Condition.
const fx = { t: '@0>1', r: [] };
const draft = (over: Partial<ConditionDraft>): ConditionDraft => ({
  op: '',
  a: '',
  b: '',
  d: '',
  fx: '=',
  ...over,
});
const compile = (text: string) => (text === '=A2>1' ? fx : null);

describe('the conditions', () => {
  it("offer Google's list, Custom formula is last", () => {
    expect(CONDITION_CHOICES.at(-1)).toBe('formula');
    expect(CONDITION_CHOICES).toContain('notBetween');
    expect(CONDITION_CHOICES.map((o) => CONDITION_LABELS[o])).toContain('Is not between');
  });
});

describe('conditionDraftOf', () => {
  it('reads a stored condition back, its formula as typed', () => {
    expect(conditionDraftOf({ op: 'formula', fx }, () => '=A2>1')).toEqual(
      draft({ op: 'formula', fx: '=A2>1' }),
    );
    expect(conditionDraftOf({ op: 'dateOn', d: 'today' }, () => '')).toEqual(
      draft({ op: 'dateOn', d: 'today' }),
    );
    expect(conditionDraftOf(undefined, () => '')).toEqual(draft({}));
  });
});

describe('takesValue', () => {
  it('asks for a value unless the condition or its period says it all', () => {
    expect(takesValue(draft({ op: 'gt' }))).toBe(true);
    expect(takesValue(draft({ op: 'dateOn' }))).toBe(true);
    expect(takesValue(draft({ op: 'dateOn', d: 'pastWeek' }))).toBe(false);
    for (const op of ['', 'empty', 'notEmpty', 'formula'] as const)
      expect(takesValue(draft({ op }))).toBe(false);
  });
});

describe('conditionOfDraft', () => {
  it('stores no condition for None', () => {
    expect(conditionOfDraft(draft({ a: '1' }), compile)).toEqual({ ok: true, part: {} });
  });

  it('stores a period in place of a date', () => {
    expect(
      conditionOfDraft(draft({ op: 'dateBefore', d: 'yesterday', a: '1/1/2026' }), compile),
    ).toEqual({
      ok: true,
      part: { op: 'dateBefore', d: 'yesterday' },
    });
  });

  it('stores both values for a range, the first only otherwise', () => {
    expect(conditionOfDraft(draft({ op: 'notBetween', a: '1', b: '5' }), compile)).toEqual({
      ok: true,
      part: { op: 'notBetween', a: '1', b: '5' },
    });
    expect(conditionOfDraft(draft({ op: 'gt', a: '1', b: '5' }), compile)).toEqual({
      ok: true,
      part: { op: 'gt', a: '1' },
    });
  });

  it('stores a custom formula it can read, with or without its =', () => {
    expect(conditionOfDraft(draft({ op: 'formula', fx: ' =A2>1 ' }), compile)).toEqual({
      ok: true,
      part: { op: 'formula', fx },
    });
    expect(conditionOfDraft(draft({ op: 'formula', fx: 'A2>1' }), compile)).toEqual({
      ok: true,
      part: { op: 'formula', fx },
    });
  });

  it('says why for a formula it cannot read, or none', () => {
    for (const text of ['=', '', '=A2>'])
      expect(conditionOfDraft(draft({ op: 'formula', fx: text }), compile)).toEqual({
        ok: false,
        why: FORMULA_UNREADABLE,
      });
  });
});
