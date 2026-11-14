import { describe, expect, it } from 'vitest';
import type { Element } from '@livedoc/document';
import { readSuggestedChanges } from './suggested-changes';
import { board, note } from './testing';

// docs/specs/021-event-storming/suggested-changes.md.

const context = (id: string, label: string, esContext: Record<string, unknown>): Element =>
  ({
    id,
    type: 'shape',
    shape: 'square',
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    label,
    esContext,
  }) as Element;

describe('readSuggestedChanges', () => {
  it('reads none off a board with none', () => {
    expect(readSuggestedChanges(board({ id: 'e1', kind: 'domain-event', col: 0 }))).toEqual([]);
  });

  it('lists the names suggested for a context and for a merge, with the contexts they are for', () => {
    const tab = board(
      { id: 'e1', kind: 'domain-event', col: 0 },
      { id: 'e2', kind: 'domain-event', col: 1 },
      context('x1', 'Ordering', {
        notes: ['e1'],
        names: [
          { name: 'Orders', reason: 'shorter', by: 'Ada' },
          { name: 'Shop', with: ['x2'] },
          { name: 'Lost', with: ['gone'] },
        ],
      }),
      context('x2', 'Kitchen', { notes: ['e2'] }),
    );
    expect(readSuggestedChanges(tab)).toEqual([
      {
        type: 'name',
        contexts: ['x1'],
        contextRefs: ['x1'],
        name: 'Orders',
        reason: 'shorter',
        by: 'Ada',
      },
      {
        type: 'name',
        contexts: ['x1', 'x2'],
        contextRefs: ['x1', 'x2'],
        name: 'Shop',
        reason: null,
        by: null,
      },
    ]);
  });

  it('lists note changes in timeline order of their note, then from the top', () => {
    const tab = board(
      {
        id: 'late',
        kind: 'domain-event',
        col: 2,
        extra: { esChanges: [{ change: 'remove', reason: 'said twice', by: 'Ada' }] },
      },
      {
        id: 'low',
        kind: 'policy',
        col: 0,
        lane: 1,
        extra: { esChanges: [{ change: 'kind', kind: 'command' }] },
      },
      {
        id: 'early',
        kind: 'domain-event',
        col: 0,
        extra: {
          esChanges: [
            { change: 'reword', words: 'Booking Placed', term: 'Order', to: 'Booking' },
            { change: 'split', parts: ['One', 'Two'] },
          ],
        },
      },
      note({
        id: 'twin',
        kind: 'domain-event',
        col: 0,
        extra: { esChanges: [{ change: 'remove' }] },
      }),
    );
    expect(readSuggestedChanges(tab)).toEqual([
      {
        type: 'change',
        note: 'early',
        noteRef: 'early',
        change: 'reword',
        words: 'Booking Placed',
        term: 'Order',
        to: 'Booking',
        reason: null,
        by: null,
      },
      {
        type: 'change',
        note: 'early',
        noteRef: 'early',
        change: 'split',
        parts: ['One', 'Two'],
        reason: null,
        by: null,
      },
      { type: 'change', note: 'twin', noteRef: 'twin', change: 'remove', reason: null, by: null },
      {
        type: 'change',
        note: 'low',
        noteRef: 'low',
        change: 'kind',
        kind: 'command',
        reason: null,
        by: null,
      },
      {
        type: 'change',
        note: 'late',
        noteRef: 'late',
        change: 'remove',
        reason: 'said twice',
        by: 'Ada',
      },
    ]);
  });

  it('puts the names before the note changes', () => {
    const tab = board(
      { id: 'e1', kind: 'domain-event', col: 0, extra: { esChanges: [{ change: 'remove' }] } },
      context('x1', 'Ordering', { notes: ['e1'], names: [{ name: 'Orders' }] }),
    );
    expect(readSuggestedChanges(tab).map((c) => c.type)).toEqual(['name', 'change']);
  });
});
