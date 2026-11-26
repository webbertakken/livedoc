// docs/specs/034-text-documents/review.md "Suggesting", "While suggesting": typing, deleting, Enter, Backspace across
// paragraphs, formatting and paragraph formatting rewritten as the person's suggestions; their own suggested text
// removed for real; one person's adjacent changes one suggestion; structure refused; metas kept.
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection, type Transaction } from 'prosemirror-state';
import type { Mark, Node as PmNode } from 'prosemirror-model';
import {
  baseKeymap,
  splitBlock,
  joinBackward,
  deleteSelection,
  toggleMark,
} from 'prosemirror-commands';
import { textDocumentSchema as schema } from './text-document-schema';
import { suggestTransaction, type Suggester } from './text-document-suggesting';

void baseKeymap;

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };
const mark = (id: string, author = ADA, at = 5) => ({ id, at, author });

function who(ids = ['s1', 's2', 's3']): Suggester {
  const queue = [...ids];
  return { ...ADA, now: 100, newId: () => queue.shift()! };
}

const p = (...content: (string | PmNode)[]) =>
  schema.nodes.paragraph!.create(
    null,
    content.map((c) => (typeof c === 'string' ? schema.text(c) : c)),
  );
const text = (value: string, ...marks: Mark[]) => schema.text(value, marks);
const ins = (m: ReturnType<typeof mark>) => schema.marks.insertion!.create(m);
const del = (m: ReturnType<typeof mark>) => schema.marks.deletion!.create(m);

function stateWith(blocks: PmNode[], anchor: number, head = anchor) {
  const doc = schema.nodes.doc!.create(null, blocks);
  return EditorState.create({ doc, selection: TextSelection.create(doc, anchor, head) });
}

/** The transaction a command makes. */
function commanded(
  state: EditorState,
  command: (s: EditorState, d: (tr: Transaction) => void) => boolean,
) {
  let made: Transaction | undefined;
  command(state, (tr) => (made = tr));
  return made!;
}

function suggest(state: EditorState, tr: Transaction, suggester = who()) {
  const result = suggestTransaction(state, tr, suggester);
  if ('refused' in result) throw new Error(result.refused);
  return { state: state.apply(result.tr), made: result.made };
}

/** Each paragraph as text, its suggested stretches marked `+…+` (inserted) and `-…-` (deleted), with their ids. */
function shape(doc: PmNode): string[] {
  const out: string[] = [];
  doc.forEach((block) => {
    let line = '';
    if (block.attrs.insertion) line += `¶+${(block.attrs.insertion as { id: string }).id} `;
    if (block.attrs.deletion) line += `¶-${(block.attrs.deletion as { id: string }).id} `;
    block.forEach((child) => {
      const i = child.marks.find((m) => m.type.name === 'insertion')?.attrs as
        { id: string } | undefined;
      const d = child.marks.find((m) => m.type.name === 'deletion')?.attrs as
        { id: string } | undefined;
      const value = child.text ?? `[${child.type.name}]`;
      line += i ? `+${value}+${i.id}` : d ? `-${value}-${d.id}` : value;
    });
    out.push(line);
  });
  return out;
}

describe('suggestTransaction', () => {
  it('inserts typed text as the person’s insertion, with their author and time', () => {
    const state = stateWith([p('The fox')], 5);
    const { state: next, made } = suggest(state, state.tr.insertText('quick '));
    expect(shape(next.doc)).toEqual(['The +quick +s1fox']);
    expect(made).toEqual(['s1']);
    const inserted = next.doc.firstChild!.child(1).marks[0]!.attrs;
    expect(inserted).toEqual({ id: 's1', at: 100, author: ADA });
    expect(next.selection.head).toBe(11);
  });

  it('marks deleted text deleted and moves the caret past it, Backspace before it and Delete after it', () => {
    const state = stateWith([p('abcd')], 3);
    const back = suggest(state, state.tr.delete(2, 3)).state;
    expect(shape(back.doc)).toEqual(['a-b-s1cd']);
    expect(back.selection.head).toBe(2);
    const forward = stateWith([p('abcd')], 2);
    const after = suggest(forward, forward.tr.delete(2, 3)).state;
    expect(shape(after.doc)).toEqual(['a-b-s1cd']);
    expect(after.selection.head).toBe(3);
  });

  it('removes the person’s own suggested text for real, skips text already deleted, and joins their suggestion', () => {
    const state = stateWith(
      [p('a', text('bc', ins(mark('s0'))), text('d', del(mark('x', BEN))), 'e')],
      5,
    );
    const { state: next } = suggest(state, state.tr.delete(2, 6));
    expect(shape(next.doc)).toEqual(['a-d-x-e-s0']);
  });

  it('inserts replacing text after the text it replaces, as one suggestion', () => {
    const state = stateWith([p('old text')], 1, 4);
    const { state: next, made } = suggest(state, state.tr.insertText('new'));
    expect(shape(next.doc)).toEqual(['-old-s1+new+s1 text']);
    expect(made).toEqual(['s1']);
  });

  it('joins a change next to the person’s own suggestion to it', () => {
    const state = stateWith([p(text('ab', ins(mark('s0'))), 'cd')], 3);
    const { state: next, made } = suggest(state, state.tr.insertText('x'));
    expect(shape(next.doc)).toEqual(['+abx+s0cd']);
    expect(made).toEqual([]);
  });

  it('suggests a paragraph break for Enter, and takes the person’s own break back on Backspace', () => {
    const state = stateWith([p('onetwo')], 4);
    const split = suggest(state, commanded(state, splitBlock)).state;
    expect(shape(split.doc)).toEqual(['one', '¶+s1 two']);
    const joined = suggest(split, commanded(split, joinBackward), who(['s9'])).state;
    expect(shape(joined.doc)).toEqual(['onetwo']);
  });

  it('suggests a join for Backspace at another’s paragraph start, keeping both paragraphs', () => {
    const state = stateWith([p('one'), p('two')], 6);
    const { state: next } = suggest(state, commanded(state, joinBackward));
    expect(shape(next.doc)).toEqual(['one', '¶-s1 two']);
  });

  it('marks a deletion across paragraphs in each, the later paragraph joined', () => {
    const state = stateWith([p('one'), p('two')], 3, 8);
    const { state: next } = suggest(state, commanded(state, deleteSelection));
    expect(shape(next.doc)).toEqual(['on-e-s1', '¶-s1 -tw-s1o']);
  });

  it('suggests a format change keeping the formatting before, and formats one’s own text plainly', () => {
    const state = stateWith([p('plain', text('mine', ins(mark('s0'))))], 1, 10);
    const bold = schema.marks.bold!.create({ value: true });
    const { state: next } = suggest(state, state.tr.addMark(1, 10, bold));
    const [plainNode, mineNode] = [next.doc.firstChild!.child(0), next.doc.firstChild!.child(1)];
    expect(plainNode.marks.find((m) => m.type.name === 'format_change')?.attrs).toEqual({
      id: 's0',
      at: 5,
      author: ADA,
      before: { bold: null },
    });
    expect(mineNode.marks.some((m) => m.type.name === 'format_change')).toBe(false);
    expect(mineNode.marks.some((m) => m.type.name === 'bold')).toBe(true);
  });

  it('refuses formatting text someone else suggested a format change to', () => {
    const others = schema.marks.format_change!.create({ ...mark('x', BEN), before: {} });
    const state = stateWith([p(text('abc', others))], 1, 4);
    const tr = state.tr.addMark(1, 4, schema.marks.italic!.create({ value: true }));
    expect(suggestTransaction(state, tr, who())).toEqual({ refused: 'others-format' });
  });

  it('suggests a paragraph format change keeping its style, formatting and list before', () => {
    const state = stateWith([p('title')], 2);
    const tr = state.tr.setNodeMarkup(0, undefined, {
      ...state.doc.firstChild!.attrs,
      style: 'Heading1',
    });
    const { state: next } = suggest(state, tr);
    const attrs = next.doc.firstChild!.attrs;
    expect(attrs.style).toBe('Heading1');
    expect(attrs.formatChange).toEqual({
      id: 's1',
      at: 100,
      author: ADA,
      before: { style: null, props: null, list: null },
    });
  });

  it('refuses a structural change, and keeps the transaction’s metas', () => {
    const state = stateWith([p('a')], 1);
    const table = state.tr.insert(0, schema.nodes.section_break!.create());
    expect(suggestTransaction(state, table, who())).toEqual({ refused: 'structure' });
    const typed = state.tr
      .insertText('x')
      .setMeta('uiEvent', 'paste')
      .setMeta('addToHistory', false);
    const result = suggestTransaction(state, typed, who());
    if ('refused' in result) throw new Error('refused');
    expect(result.tr.getMeta('uiEvent')).toBe('paste');
    expect(result.tr.getMeta('addToHistory')).toBe(false);
  });

  it('keeps a toggled mark command’s change a format suggestion', () => {
    const state = stateWith([p('abc')], 1, 3);
    const tr = commanded(state, toggleMark(schema.marks.italic!, { value: true }));
    const { state: next } = suggest(state, tr);
    expect(
      next.doc
        .firstChild!.child(0)
        .marks.map((m) => m.type.name)
        .sort(),
    ).toEqual(['format_change', 'italic']);
  });
});
