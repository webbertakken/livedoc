import { describe, expect, it } from 'vitest';
import type { CandidateContextElement, Element } from '@livedoc/document';
import {
  KIND,
  REMOVE,
  REWORD,
  SPLIT,
  STEP,
  byId,
  changed,
  named,
  orderFlow,
} from './change-board.fixture';
import { REMOVE_PREVIEW_OPACITY, offeredPreview } from './change-preview';
import { ARRANGE_KEY, changeKey, contextsKey, nameKey, planKey, termKey } from './suggestion-view';
import { kitchenNotes, plannedKitchen } from './lane-board.fixture';

// What a suggested change would make of the board while a person looks at it
// (docs/specs/021-event-storming/suggested-changes.md "How a person sees and decides"): for drawing only.

const NONE: ReadonlySet<string> = new Set();
const label = (els: readonly Element[], id: string) => byId(els, id).label;
const differing = (a: readonly Element[], b: readonly Element[]) =>
  b.filter((el, i) => el !== a[i]).map((el) => el.id);

describe('offeredPreview', () => {
  it('draws a reword’s new words on its note and on the notes of its context that hold the term', () => {
    const board = changed(orderFlow(), 'pack', REWORD);
    const preview = offeredPreview(board, changeKey('pack'), NONE)!;
    expect(differing(board, preview.elements)).toEqual(['pack', 'packed', 'sent']);
    expect(label(preview.elements, 'packed')).toBe('Parcel packed and shipped');
    expect(preview).toMatchObject({ parts: [], struck: null });
    expect(preview.shiftX.size).toBe(0);
  });

  it('draws the reword across the board for the Everywhere scope', () => {
    const board = changed(orderFlow(), 'pack', REWORD);
    const preview = offeredPreview(board, changeKey('pack', 0, 'board'), NONE)!;
    expect(differing(board, preview.elements)).toEqual([
      'place',
      'placed',
      'refund',
      'pack',
      'packed',
      'sent',
    ]);
  });

  it('draws a note as the kind it would become', () => {
    const board = changed(orderFlow(), 'refund', REMOVE, KIND);
    const preview = offeredPreview(board, changeKey('refund', 1), NONE)!;
    expect(byId(preview.elements, 'refund').esKind).toBe('command');
    expect(differing(board, preview.elements)).toEqual(['refund']);
  });

  it('draws a split’s first part on the note and the others where they would land, the board making room', () => {
    const board = changed(orderFlow(), 'packed', SPLIT);
    const preview = offeredPreview(board, changeKey('packed'), NONE)!;
    expect(label(preview.elements, 'packed')).toBe('Order packed');
    expect(differing(board, preview.elements)).toEqual(['packed']);
    expect(preview.elements).toHaveLength(board.length);
    const packed = byId(board, 'packed');
    expect(preview.parts).toEqual([
      {
        id: expect.any(String),
        kind: 'domain-event',
        words: 'Order shipped',
        spot: { x: packed.x + STEP, y: packed.y, width: 200, height: 200 },
      },
    ]);
    expect([...preview.shiftX]).toEqual([['sent', STEP]]);
  });

  it('draws a note to be removed faint, and says which to strike', () => {
    const board = changed(orderFlow(), 'sent', REMOVE);
    const preview = offeredPreview(board, changeKey('sent'), NONE)!;
    expect(byId(preview.elements, 'sent').opacity).toBe(REMOVE_PREVIEW_OPACITY);
    expect(preview.struck).toBe('sent');
    expect(differing(board, preview.elements)).toEqual(['sent']);
  });

  it('draws a context under the name a chip offers', () => {
    const board = named(orderFlow(), ['ordering'], 'Order taking', 'Sales');
    const preview = offeredPreview(board, nameKey(['ordering'], 'Sales'), NONE)!;
    expect(byId<CandidateContextElement>(preview.elements, 'ordering').label).toBe('Sales');
    expect(differing(board, preview.elements)).toEqual(['ordering']);
  });

  it('changes nothing on the board for a merge’s chip: its caption says it', () => {
    const board = named(orderFlow(), ['ordering', 'fulfilment'], 'Shop');
    const preview = offeredPreview(board, nameKey(['ordering', 'fulfilment'], 'Shop'), NONE)!;
    expect(preview.elements).toBe(board);
  });

  it('is nothing for any other key, a change or a name that is gone, and a note that may not change', () => {
    const board = changed(named(orderFlow(), ['ordering'], 'Sales'), 'pack', REWORD);
    for (const key of [
      null,
      's:pack',
      'c:ordering',
      contextsKey(['ordering']),
      changeKey('pack', 1),
      changeKey('nowhere'),
      changeKey('ordering'),
      nameKey(['ordering'], 'Billing'),
      nameKey(['ordering', 'fulfilment'], 'Sales'),
    ])
      expect(offeredPreview(board, key, NONE)).toBeNull();
    expect(offeredPreview(board, changeKey('pack'), new Set(['pack']))).toBeNull();
  });
});

// docs/specs/021-event-storming/lane-plans.md "How a person sees and decides", arrange.md "How a person arranges".
describe('a renamed term (docs/specs/021-event-storming/board-language.md "The Language tab")', () => {
  it('draws the new term on every note the rename reaches, and on nothing else', () => {
    const board = orderFlow();
    const preview = offeredPreview(board, termKey('order', 'parcel', { type: 'board' }), NONE)!;
    expect(differing(board, preview.elements)).toEqual([
      'place',
      'placed',
      'refund',
      'pack',
      'packed',
      'sent',
    ]);
    expect(label(preview.elements, 'placed')).toBe('Parcel placed');
    // A word inside another is no match: the context keeps its name.
    expect(byId<CandidateContextElement>(preview.elements, 'ordering').label).toBe('Ordering');
    expect(preview).toMatchObject({ parts: [], struck: null, board: null });
  });

  it('stays within the context the rename is for', () => {
    const board = orderFlow();
    const preview = offeredPreview(
      board,
      termKey('order', 'parcel', { type: 'context', id: 'fulfilment' }),
      NONE,
    )!;
    expect(differing(board, preview.elements)).toEqual(['pack', 'packed', 'sent']);
  });

  it('leaves alone a note that may not change, and draws nothing when nothing would change', () => {
    const board = orderFlow();
    const key = termKey('order', 'parcel', { type: 'context', id: 'ordering' });
    expect(differing(board, offeredPreview(board, key, new Set(['place']))!.elements)).toEqual([
      'placed',
    ]);
    expect(offeredPreview(board, termKey('order', 'order', { type: 'board' }), NONE)).toBeNull();
    expect(offeredPreview(board, termKey('bill', 'check', { type: 'board' }), NONE)).toBeNull();
  });
});

describe('a whole board offered', () => {
  it('draws a lane plan as applying would leave it, and says what the bar needs', () => {
    const tab = plannedKitchen();
    const preview = offeredPreview(tab.elements, planKey('plan'), new Set())!;
    expect(preview.board).toMatchObject({ what: 'lane-plan', lanes: 2, gained: 0 });
    expect(preview.elements).toBe(preview.board!.elements);
    expect(preview.parts).toEqual([]);
    expect(offeredPreview(tab.elements, planKey('gone'), new Set())).toBeNull();
  });

  it('draws the board arranged, leaving a note on a locked layer where it is', () => {
    const notes = kitchenNotes().map((el) =>
      el.id === 'dish-plated' ? { ...el, x: 2000, layerId: 'back' } : el,
    );
    const free = offeredPreview(notes, ARRANGE_KEY, new Set())!;
    expect(free.board!.what).toBe('arrange');
    expect(free.elements.find((el) => el.id === 'dish-plated')).not.toMatchObject({ x: 2000 });
    const layers = [
      { id: 'front', name: 'Front' },
      { id: 'back', name: 'Back', locked: true },
    ];
    const held = offeredPreview(notes, ARRANGE_KEY, new Set(), layers);
    expect(held?.elements.find((el) => el.id === 'dish-plated')).toMatchObject({ x: 2000 });
  });
});
