import { afterEach, describe, expect, it } from 'vitest';
import {
  clearContextSelection,
  contextSelectionFor,
  editContextName,
  resetContextSelectionForTests,
  selectContext,
  setDrawingContext,
} from './context-selection';

// docs/specs/021-event-storming/candidate-contexts.md "Selecting several and merging".

afterEach(resetContextSelectionForTests);

describe('the context selection', () => {
  it('selects one alone, adds and removes with Shift, and is empty on another board', () => {
    selectContext('t', 'a');
    selectContext('t', 'b', true);
    expect([...contextSelectionFor('t').ids]).toEqual(['a', 'b']);
    selectContext('t', 'a', true);
    expect([...contextSelectionFor('t').ids]).toEqual(['b']);
    selectContext('t', 'c');
    expect([...contextSelectionFor('t').ids]).toEqual(['c']);
    expect(contextSelectionFor('other').ids.size).toBe(0);
  });

  it('opens a name for typing, selecting it alone, and closes it keeping the selection', () => {
    selectContext('t', 'a');
    selectContext('t', 'b', true);
    editContextName('t', 'b');
    expect(contextSelectionFor('t')).toMatchObject({ editingId: 'b' });
    expect([...contextSelectionFor('t').ids]).toEqual(['b']);
    editContextName('t', null);
    expect(contextSelectionFor('t').editingId).toBeNull();
    expect([...contextSelectionFor('t').ids]).toEqual(['b']);
  });

  it('clears, and does nothing when already clear', () => {
    selectContext('t', 'a');
    clearContextSelection('t');
    const cleared = contextSelectionFor('t');
    expect(cleared.ids.size).toBe(0);
    clearContextSelection('t');
    expect(contextSelectionFor('t')).toBe(cleared);
  });
});

describe('the Draw Context pen', () => {
  it('arms, lets go of the selection, and is put away by a clear or a selection', () => {
    selectContext('t', 'a');
    setDrawingContext('t', true);
    expect(contextSelectionFor('t')).toMatchObject({ drawing: true, editingId: null });
    expect(contextSelectionFor('t').ids.size).toBe(0);
    clearContextSelection('t');
    expect(contextSelectionFor('t').drawing).toBe(false);
    setDrawingContext('t', true);
    selectContext('t', 'a');
    expect(contextSelectionFor('t').drawing).toBe(false);
  });
});
