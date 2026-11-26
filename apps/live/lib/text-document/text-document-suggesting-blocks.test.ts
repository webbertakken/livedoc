// docs/specs/034-text-documents/review.md "While suggesting" (Whole blocks, Inside a suggested block): a table, a
// section break or a table of contents put in as the person's insertion of the whole block, its content unmarked and a
// paragraph split for it part of the same suggestion; a whole block deleted as a suggestion (one's own taken away);
// one's own suggested table written in and changed plainly; anyone else's typing in it their own insertion (director,
// 2026-11-26); anyone else's table's rows and columns not yet; a kept block never.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { deleteSelection } from 'prosemirror-commands';
import { PageSetup } from '@livedoc/text-documents';
import { textDocumentSchema as schema } from './text-document-schema';
import { suggestTransaction, type Suggester } from './text-document-suggesting';
import { insertTable, newTable } from './text-document-tables';
import { insertRows } from './text-document-table-edits';
import { insertSectionBreak } from './text-document-breaks';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };
const mark = (id: string, author = ADA, at = 5) => ({ id, at, author });
const as = (person: typeof ADA, id = 's1'): Suggester => ({ ...person, now: 100, newId: () => id });

const p = (text = '') => schema.nodes.paragraph!.create(null, text ? schema.text(text) : null);
const table = (attrs: Record<string, unknown> = {}) => {
  const made = newTable({ rows: 2, columns: 2, width: 200 });
  return made.type.create({ ...made.attrs, ...attrs }, made.content);
};

function stateWith(blocks: PmNode[], anchor: number, head = anchor) {
  const doc = schema.nodes.doc!.create(null, blocks);
  return EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head) });
}

function commanded(
  state: EditorState,
  command: (s: EditorState, d: (tr: Transaction) => void) => boolean,
) {
  let made: Transaction | undefined;
  command(state, (tr) => (made = tr));
  return made!;
}

function suggest(state: EditorState, tr: Transaction, who = as(ADA)) {
  const result = suggestTransaction(state, tr, who);
  if ('refused' in result) throw new Error(result.refused);
  return state.apply(result.tr);
}

const idOf = (value: unknown) => (value as { id?: string } | null)?.id;
const blockOf = (state: EditorState, name: string) => {
  let found: PmNode | undefined;
  state.doc.descendants((n) => {
    if (!found && n.type.name === name) found = n;
    return !found;
  });
  return found;
};
/** Each text node's text and its insertion's id, in order. */
const marked = (node: PmNode) => {
  const out: [string, string | undefined][] = [];
  node.descendants((n) => {
    if (n.isText)
      out.push([n.text!, idOf(n.marks.find((m) => m.type.name === 'insertion')?.attrs)]);
  });
  return out;
};
/** The first cell's first paragraph's inside position of the first table in the doc. */
const inFirstCell = (state: EditorState) => {
  let at = -1;
  state.doc.descendants((n, pos) => {
    if (at < 0 && n.type.name === 'paragraph' && state.doc.resolve(pos).depth > 0) at = pos + 1;
    return at < 0;
  });
  return at;
};

describe('suggestTransaction on whole blocks', () => {
  it('puts a table in as the person’s insertion, its cells unmarked, a split paragraph’s break the same suggestion', () => {
    const state = stateWith([p('abcd')], 3);
    const next = suggest(state, commanded(state, insertTable({ rows: 2, columns: 2 }, 200)));
    const inserted = blockOf(next, 'table')!;
    expect(idOf(inserted.attrs.insertion)).toBe('s1');
    inserted.descendants((n) => {
      if (n.type.name === 'paragraph') expect(n.attrs.insertion).toBeNull();
      return true;
    });
    const after = next.doc.lastChild!;
    expect(after.textContent).toBe('cd');
    expect(idOf(after.attrs.insertion)).toBe('s1');
    expect(marked(next.doc)).toEqual([
      ['ab', undefined],
      ['cd', undefined],
    ]);
    // The caret where the command left it, as in Editing: in the first cell.
    expect(next.selection.from).toBe(inFirstCell(next));
  });

  it('puts a section break in as the person’s insertion', () => {
    const state = stateWith([p('abcd')], 3);
    const next = suggest(
      state,
      commanded(state, insertSectionBreak('next-page', PageSetup.of('a4', 'odf'))),
    );
    expect(idOf(blockOf(next, 'section_break')!.attrs.insertion)).toBe('s1');
  });

  it('suggests a whole table selected deleted, and takes one’s own suggested table away', () => {
    const others = stateWith([p('a'), table(), p('b')], 1);
    const selected = others.apply(others.tr.setSelection(NodeSelection.create(others.doc, 3)));
    const next = suggest(selected, commanded(selected, deleteSelection));
    expect(idOf(blockOf(next, 'table')!.attrs.deletion)).toBe('s1');

    const own = stateWith([p('a'), table({ insertion: mark('s0') }), p('b')], 1);
    const ownSelected = own.apply(own.tr.setSelection(NodeSelection.create(own.doc, 3)));
    expect(
      blockOf(suggest(ownSelected, commanded(ownSelected, deleteSelection)), 'table'),
    ).toBeUndefined();
  });

  it('writes in one’s own suggested table plainly, part of its suggestion', () => {
    const state = stateWith([p('a'), table({ insertion: mark('s0') }), p('b')], 1);
    const at = inFirstCell(state);
    const inCell = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
    const next = suggest(inCell, inCell.tr.insertText('x'));
    expect(marked(blockOf(next, 'table')!)).toEqual([['x', undefined]]);
  });

  it('marks someone else’s writing in a suggested table as their own insertion', () => {
    const state = stateWith([p('a'), table({ insertion: mark('s0') }), p('b')], 1);
    const at = inFirstCell(state);
    const inCell = state.apply(state.tr.setSelection(TextSelection.create(state.doc, at)));
    const next = suggest(inCell, inCell.tr.insertText('x'), as(BEN, 'b1'));
    expect(marked(blockOf(next, 'table')!)).toEqual([['x', 'b1']]);
    expect(idOf(blockOf(next, 'table')!.attrs.insertion)).toBe('s0');
  });

  it('adds a row to one’s own suggested table plainly, and refuses one to anyone else’s', () => {
    const own = stateWith([p('a'), table({ insertion: mark('s0') }), p('b')], 1);
    const inOwn = own.apply(own.tr.setSelection(TextSelection.create(own.doc, inFirstCell(own))));
    const grown = suggest(inOwn, commanded(inOwn, insertRows('below')));
    expect(blockOf(grown, 'table')!.childCount).toBe(3);

    const others = stateWith([p('a'), table(), p('b')], 1);
    const inOthers = others.apply(
      others.tr.setSelection(TextSelection.create(others.doc, inFirstCell(others))),
    );
    expect(suggestTransaction(inOthers, commanded(inOthers, insertRows('below')), as(ADA))).toEqual(
      {
        refused: 'structure',
      },
    );
  });

  it('marks someone else’s writing deleted inside a table’s cell, never joining cells', () => {
    const state = stateWith([p('a'), table(), p('b')], 1);
    const at = inFirstCell(state);
    const typed = state.apply(state.tr.insertText('xy', at));
    const selected = typed.apply(
      typed.tr.setSelection(TextSelection.create(typed.doc, at, at + 2)),
    );
    const next = suggest(selected, commanded(selected, deleteSelection));
    const cellText: string[] = [];
    blockOf(next, 'table')!.descendants((n) => {
      if (n.isText) cellText.push(n.text!);
      return true;
    });
    expect(cellText).toEqual(['xy']);
    expect(blockOf(next, 'table')!.childCount).toBe(2);
  });

  it('refuses a whole row of anyone else’s table deleted: rows are not suggested yet', () => {
    const state = stateWith([p('a'), table(), p('b')], 1);
    const tableAt = 3;
    const row = state.doc.nodeAt(tableAt)!.firstChild!;
    const tr = state.tr.delete(tableAt + 1, tableAt + 1 + row.nodeSize);
    expect(suggestTransaction(state, tr, as(ADA))).toEqual({ refused: 'structure' });
  });

  it('refuses a change inside anyone else’s table of contents, and makes one inside one’s own plainly', () => {
    const contents = (attrs: Record<string, unknown>) =>
      schema.nodes.table_of_contents!.create({ look: 'plain', levels: 6, ...attrs }, p('entry'));
    const others = stateWith([p('a'), contents({}), p('b')], 1);
    expect(suggestTransaction(others, others.tr.insertText('x', 5), as(ADA))).toEqual({
      refused: 'structure',
    });
    const own = stateWith([p('a'), contents({ insertion: mark('s0') }), p('b')], 1);
    const next = suggest(own, own.tr.insertText('x', 5));
    expect(marked(blockOf(next, 'table_of_contents')!)).toEqual([['xentry', undefined]]);
  });

  it('refuses a kept block, in a slice or deleted', () => {
    const kept = schema.nodes.kept_block!.create({ name: 'x', xml: { xml: '<x/>', ns: {} } });
    const state = stateWith([p('ab')], 2);
    expect(suggestTransaction(state, state.tr.insert(4, kept), as(ADA))).toEqual({
      refused: 'structure',
    });
  });
});
