// docs/specs/034-text-documents/lists.md "Making a list", "Levels", "Checklists".
import { describe, expect, it } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { ListDefinition } from '@livedoc/text-documents';
import {
  enterInList,
  backspaceInList,
  isListOn,
  stepListLevel,
  tabInList,
  toggleChecked,
  toggleList,
} from './text-document-lists';
import { access, p, places, run, stateOf } from './text-document-lists.test-kit';

describe('toggleList', () => {
  it('puts the paragraphs in a new list of the kind, Google\u2019s style, keeping levels', () => {
    const lists = access({ L1: ListDefinition.of('bullet') });
    const state = stateOf([p('a'), p('b', { id: 'L1', level: 2 }), p('c')], [0, 1]);
    const next = run(state, toggleList(lists, 'number'));
    expect(lists.added).toEqual([['L2', ListDefinition.of('number')]]);
    expect(places(next)).toEqual([{ id: 'L2', level: 0 }, { id: 'L2', level: 2 }, null]);
    expect(isListOn(next, lists.read(), 'number')).toBe(true);
    expect(isListOn(next, lists.read(), 'bullet')).toBe(false);
  });

  it('joins the list just before when it is of the same kind, so the numbering runs on', () => {
    const lists = access({ L1: ListDefinition.of('number') });
    const state = stateOf([p('a', { id: 'L1', level: 0 }), p('b')], 1);
    const next = run(state, toggleList(lists, 'number'));
    expect(lists.added).toEqual([]);
    expect(places(next)[1]).toEqual({ id: 'L1', level: 0 });
  });

  it('takes the paragraphs out when all are in lists of the kind', () => {
    const lists = access({ L1: ListDefinition.of('check') });
    const state = stateOf(
      [p('a', { id: 'L1', level: 0, checked: true }), p('b', { id: 'L1', level: 1 })],
      [0, 1],
    );
    expect(places(run(state, toggleList(lists, 'check')))).toEqual([null, null]);
  });
});

describe('stepListLevel', () => {
  it('moves the items the selection touches a level in or out, held to 0 and 8', () => {
    const state = stateOf(
      [p('a', { id: 'L1', level: 0 }), p('b', { id: 'L1', level: 8 }), p('c')],
      [0, 2],
    );
    expect(places(run(state, stepListLevel(1)))).toEqual([
      { id: 'L1', level: 1 },
      { id: 'L1', level: 8 },
      null,
    ]);
    expect(places(run(state, stepListLevel(-1)))[1]).toEqual({ id: 'L1', level: 7 });
  });

  it('declines when no item is selected, so the paragraph indent runs instead', () => {
    run(stateOf([p('a')]), stepListLevel(1), false);
  });
});

describe('toggleChecked', () => {
  it('ticks every checklist item unless all are, then unticks them', () => {
    const lists = { L1: ListDefinition.of('check'), L2: ListDefinition.of('bullet') };
    const state = stateOf(
      [
        p('a', { id: 'L1', level: 0, checked: true }),
        p('b', { id: 'L1', level: 0 }),
        p('c', { id: 'L2', level: 0 }),
      ],
      [0, 2],
    );
    const ticked = run(
      state,
      toggleChecked(() => lists),
    );
    expect(places(ticked).map((l) => l?.checked)).toEqual([true, true, undefined]);
    const unticked = run(
      ticked.apply(ticked.tr.setSelection(TextSelection.create(ticked.doc, 1, 6))),
      toggleChecked(() => lists),
    );
    expect(places(unticked).map((l) => l?.checked ?? false)).toEqual([false, false, false]);
  });

  it('declines outside a checklist', () => {
    run(
      stateOf([p('a')]),
      toggleChecked(() => ({})),
      false,
    );
  });
});

describe('the keys in a list', () => {
  it('Enter makes a new unticked item at the same level', () => {
    const state = stateOf([p('ab', { id: 'L1', level: 1, checked: true, restart: 3 })]);
    const caret = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
    const next = run(caret, enterInList);
    expect(places(next)).toEqual([
      { id: 'L1', level: 1, checked: true, restart: 3 },
      { id: 'L1', level: 1 },
    ]);
    expect(next.selection.$from.parent).toBe(next.doc.child(1));
  });

  it('Enter splits an item mid-text into two items', () => {
    const state = stateOf([p('abcd', { id: 'L1', level: 0 })]);
    const mid = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 3)));
    const next = run(mid, enterInList);
    expect(next.doc.child(0).textContent).toBe('ab');
    expect(places(next)[1]).toEqual({ id: 'L1', level: 0 });
  });

  it('Enter on an empty item takes it out of the list', () => {
    expect(places(run(stateOf([p('', { id: 'L1', level: 0 })]), enterInList))).toEqual([null]);
  });

  it('Backspace at the start of an item takes it out, keeping its text', () => {
    const next = run(stateOf([p('ab', { id: 'L1', level: 0 })]), backspaceInList);
    expect(places(next)).toEqual([null]);
    expect(next.doc.textContent).toBe('ab');
  });

  it('Tab and Shift+Tab at the start of an item change its level', () => {
    const state = stateOf([p('ab', { id: 'L1', level: 1 })]);
    expect(places(run(state, tabInList(1)))[0]).toEqual({ id: 'L1', level: 2 });
    expect(places(run(state, tabInList(-1)))[0]).toEqual({ id: 'L1', level: 0 });
  });

  it('leaves every key to the editor outside a list, or past an item\u2019s start', () => {
    run(stateOf([p('ab')]), enterInList, false);
    run(stateOf([p('ab')]), backspaceInList, false);
    const inside = stateOf([p('ab', { id: 'L1', level: 0 })]);
    const later = inside.apply(inside.tr.setSelection(TextSelection.create(inside.doc, 2)));
    run(later, backspaceInList, false);
    run(later, tabInList(1), false);
  });
});
