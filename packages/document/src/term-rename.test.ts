import { describe, expect, it } from 'vitest';
import type { Element } from './index';
import { renameTerm, termRename } from './term-rename';

// Rename Term (docs/specs/021-event-storming/board-language.md "The Language tab", "How a term is matched").

const note = (id: string, label: string, extra: Record<string, unknown> = {}): Element => ({
  id,
  type: 'sticky',
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  label,
  esKind: 'domain-event',
  ...extra,
});

const context = (id: string, label: string, notes: string[], extra = {}): Element => ({
  id,
  type: 'shape',
  shape: 'square',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  label,
  esContext: { notes, ...extra },
});

const board: Element[] = [
  note('taken', 'Order taken'),
  note('plated', 'Orders plated', { richText: [{ text: 'Orders plated', bold: true }] }),
  note('served', 'Table served'),
  note('paid', 'Order paid'),
  note('reorder', 'Reorder stock'),
  note('offered', 'Order sent back', { esSuggestion: { by: 'agent' } }),
  { id: 'text', type: 'text', x: 0, y: 0, width: 10, height: 10, label: 'Order of service' },
  context('kitchen', 'Order line', ['taken', 'plated']),
  context('floor', 'Floor', ['served']),
  context('maybe', 'Order desk', ['paid'], { suggestion: { by: 'agent' } }),
];

const labelOf = (els: Element[], id: string) =>
  (els.find((e) => e.id === id) as { label?: string }).label;

describe('termRename', () => {
  it('reaches every workshop note and kept context name on the board, by whole words', () => {
    expect(termRename(board, 'order', 'ticket', { type: 'board' })).toEqual({
      notes: [
        { id: 'taken', words: 'Ticket taken' },
        { id: 'plated', words: 'Tickets plated' },
        { id: 'paid', words: 'Ticket paid' },
      ],
      contexts: [{ id: 'kitchen', name: 'Ticket line' }],
    });
  });

  it('stays within one kept context: its notes and its name', () => {
    expect(termRename(board, 'order', 'ticket', { type: 'context', id: 'kitchen' })).toEqual({
      notes: [
        { id: 'taken', words: 'Ticket taken' },
        { id: 'plated', words: 'Tickets plated' },
      ],
      contexts: [{ id: 'kitchen', name: 'Ticket line' }],
    });
  });

  it('reaches only the notes in no kept context, and no context name', () => {
    expect(termRename(board, 'order', 'ticket', { type: 'none' })).toEqual({
      notes: [{ id: 'paid', words: 'Ticket paid' }],
      contexts: [],
    });
  });

  it('changes nothing in a context that is gone or only suggested', () => {
    expect(termRename(board, 'order', 'ticket', { type: 'context', id: 'gone' })).toEqual({
      notes: [],
      contexts: [],
    });
    expect(termRename(board, 'order', 'ticket', { type: 'context', id: 'maybe' })).toEqual({
      notes: [],
      contexts: [],
    });
  });

  it('leaves alone what may not change', () => {
    const inert = new Set(['taken', 'kitchen']);
    expect(termRename(board, 'order', 'ticket', { type: 'board' }, inert)).toEqual({
      notes: [
        { id: 'plated', words: 'Tickets plated' },
        { id: 'paid', words: 'Ticket paid' },
      ],
      contexts: [],
    });
  });

  it('changes nothing for a term that is not one, or a rename to the same words', () => {
    const nothing = { notes: [], contexts: [] };
    expect(termRename(board, 'order', '   ', { type: 'board' })).toEqual(nothing);
    expect(termRename(board, '', 'ticket', { type: 'board' })).toEqual(nothing);
    expect(termRename(board, 'order', 'x'.repeat(61), { type: 'board' })).toEqual(nothing);
    expect(termRename(board, 'order', 'ORDER', { type: 'board' })).toEqual(nothing);
  });
});

describe('renameTerm', () => {
  it('writes the notes and the context names in one board, dropping formatting of the old words', () => {
    const next = renameTerm(board, 'order', 'ticket', { type: 'board' });
    expect(labelOf(next, 'taken')).toBe('Ticket taken');
    expect(labelOf(next, 'plated')).toBe('Tickets plated');
    expect(
      (next.find((e) => e.id === 'plated') as { richText?: unknown }).richText,
    ).toBeUndefined();
    expect(labelOf(next, 'kitchen')).toBe('Ticket line');
    // A word inside another word, a suggestion, a suggested context and plain text keep their words.
    expect(labelOf(next, 'reorder')).toBe('Reorder stock');
    expect(labelOf(next, 'offered')).toBe('Order sent back');
    expect(labelOf(next, 'maybe')).toBe('Order desk');
    expect(labelOf(next, 'text')).toBe('Order of service');
    expect(next.find((e) => e.id === 'served')).toBe(board.find((e) => e.id === 'served'));
  });

  it('answers the same board when nothing would change', () => {
    expect(renameTerm(board, 'bill', 'check', { type: 'board' })).toBe(board);
  });
});
