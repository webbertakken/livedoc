import { describe, expect, it } from 'vitest';
import type { Tab } from '@livedoc/document';
import { EMPTY_SELECTION, type Selection } from './selection-store';
import { StepSelections, hasSelection, sameSelection, selectionWithin } from './step-selection';

// docs/specs/008-canvas/canvas-and-palette.md "Undo / Redo": each step keeps the selection it was made with, so undo
// brings it back, and redo brings back the selection undo left.
const sel = (...ids: string[]): Selection =>
  ids.length === 1
    ? { selectedId: ids[0]!, multiSelectedIds: new Set() }
    : { selectedId: null, multiSelectedIds: new Set(ids) };

describe('StepSelections', () => {
  it('gives undo the selection a step was made with', () => {
    const marks = StepSelections.record(StepSelections.empty(), 3, sel('a'));

    expect(StepSelections.forUndo(marks, 3)).toEqual(sel('a'));
  });

  it('gives redo the selection undo left behind', () => {
    let marks = StepSelections.record(StepSelections.empty(), 3, sel('a'));
    marks = StepSelections.leftByUndo(marks, 3, sel('b', 'c'));

    expect(StepSelections.forRedo(marks, 3)).toEqual(sel('b', 'c'));
  });

  it('forgets what redo had once a new step is made at that depth', () => {
    let marks = StepSelections.record(StepSelections.empty(), 3, sel('a'));
    marks = StepSelections.leftByUndo(marks, 3, sel('b'));
    marks = StepSelections.record(marks, 3, sel('z'));

    expect(StepSelections.forUndo(marks, 3)).toEqual(sel('z'));
    expect(StepSelections.forRedo(marks, 3)).toBeNull();
  });

  it('knows nothing of a step it never saw', () => {
    expect(StepSelections.forUndo(StepSelections.empty(), 1)).toBeNull();
    expect(StepSelections.forRedo(StepSelections.empty(), 1)).toBeNull();
    expect(StepSelections.leftByUndo(StepSelections.empty(), 1, sel('a'))).toEqual(
      StepSelections.empty(),
    );
  });

  it('keeps no more steps than history does', () => {
    let marks = StepSelections.empty();
    for (let depth = 1; depth <= 12; depth++)
      marks = StepSelections.record(marks, depth, sel('a'), 10);

    expect(StepSelections.forUndo(marks, 2)).toBeNull();
    expect(StepSelections.forUndo(marks, 3)).toEqual(sel('a'));
  });
});

describe('selectionWithin', () => {
  const tabs = [
    { id: 't', elements: [{ id: 'a' }, { id: 'b' }] },
    { id: 'u', elements: [{ id: 'c' }] },
  ] as unknown as Tab[];

  it('keeps the elements still there', () => {
    expect(selectionWithin(sel('a', 'b'), tabs, 't')).toEqual(sel('a', 'b'));
  });

  it('drops the elements gone or on another tab', () => {
    expect(selectionWithin(sel('a', 'x', 'c'), tabs, 't')).toEqual(sel('a'));
    expect(selectionWithin(sel('x'), tabs, 't')).toEqual(EMPTY_SELECTION);
  });

  it('keeps a multi-selection a multi-selection while two remain', () => {
    expect(selectionWithin(sel('a', 'b', 'x'), tabs, 't')).toEqual(sel('a', 'b'));
  });

  it('selects nothing on a tab it cannot find', () => {
    expect(selectionWithin(sel('a'), tabs, 'gone')).toEqual(EMPTY_SELECTION);
  });
});

describe('selection comparisons', () => {
  it('tells an empty selection from one with members', () => {
    expect(hasSelection(EMPTY_SELECTION)).toBe(false);
    expect(hasSelection(sel('a'))).toBe(true);
    expect(hasSelection(sel('a', 'b'))).toBe(true);
  });

  it('compares by members', () => {
    expect(sameSelection(sel('a', 'b'), sel('b', 'a'))).toBe(true);
    expect(sameSelection(sel('a'), sel('b'))).toBe(false);
    expect(sameSelection(sel('a'), sel('a', 'b'))).toBe(false);
  });
});
