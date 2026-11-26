// docs/specs/034-text-documents/review.md "While suggesting" (Objects in a line, Breaks and lines, One's own suggested
// object): a picture, an equation or a bookmark put in as the person's insertion and left selected; page and column
// breaks and horizontal lines as suggested paragraphs; one's own suggested object changed plainly; anyone else's
// object changed never, so no change is folded into someone else's suggestion.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import { deleteSelection } from 'prosemirror-commands';
import { textDocumentSchema as schema } from './text-document-schema';
import { suggestTransaction, type Suggester } from './text-document-suggesting';
import { insertPicture } from './text-document-picture-insert';
import { insertEquation } from './text-document-equation-insert';
import { insertPageBreak, insertColumnBreak } from './text-document-breaks';
import { insertHorizontalLine } from './text-document-horizontal-line';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const BEN = { key: 'k-ben', name: 'Ben', colour: '#16a34a' };
const mark = (id: string, author = ADA, at = 5) => ({ id, at, author });
const who = (): Suggester => ({ ...ADA, now: 100, newId: () => 's1' });

const p = (...content: (string | PmNode)[]) =>
  schema.nodes.paragraph!.create(
    null,
    content.map((c) => (typeof c === 'string' ? schema.text(c) : c)),
  );
const equation = (attrs: Record<string, unknown> = {}) =>
  schema.nodes.equation!.create({ math: [], ...attrs });

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

function suggest(state: EditorState, tr: Transaction) {
  const result = suggestTransaction(state, tr, who());
  if ('refused' in result) throw new Error(result.refused);
  return state.apply(result.tr);
}

const idOf = (value: unknown) => (value as { id?: string } | null)?.id;

describe('suggestTransaction on objects in a line', () => {
  it('puts a picture in as the person’s insertion and leaves it selected', () => {
    const state = stateWith([p('ab')], 2);
    const next = suggest(
      state,
      commanded(state, insertPicture({ key: 'm1', width: 10, height: 10 })),
    );
    const picture = next.doc.firstChild!.child(1);
    expect(picture.type.name).toBe('picture');
    expect(idOf(picture.attrs.insertion)).toBe('s1');
    expect(next.selection).toBeInstanceOf(NodeSelection);
    expect((next.selection as NodeSelection).node.type.name).toBe('picture');
  });

  it('puts a picture after someone else’s text it replaces, that text suggested deleted', () => {
    const state = stateWith([p('abcd')], 2, 4);
    const next = suggest(
      state,
      commanded(state, insertPicture({ key: 'm1', width: 10, height: 10 })),
    );
    const row = next.doc.firstChild!;
    expect(row.child(1).text).toBe('bc');
    expect(row.child(1).marks.map((m) => m.type.name)).toContain('deletion');
    expect(row.child(2).type.name).toBe('picture');
    expect((next.selection as NodeSelection).from).toBe(4);
  });

  it('puts an equation in as the person’s insertion, left selected', () => {
    const state = stateWith([p('ab')], 2);
    const next = suggest(state, commanded(state, insertEquation));
    expect(idOf(next.doc.firstChild!.child(1).attrs.insertion)).toBe('s1');
    expect((next.selection as NodeSelection).node.type.name).toBe('equation');
  });

  it('changes the person’s own suggested equation plainly, part of its suggestion, where it is', () => {
    const own = equation({ insertion: mark('s0') });
    const state = stateWith([p('a', own, 'b')], 1);
    const tr = state.tr
      .setNodeMarkup(2, undefined, { ...own.attrs, math: [{ kind: 'x' }] })
      .setMeta('box', { pos: 2 });
    const result = suggestTransaction(state, tr, who());
    if ('refused' in result) throw new Error(result.refused);
    expect(result.made).toEqual([]);
    expect(result.tr.steps).toHaveLength(1);
    // What it carries for plugins still holds: nothing moved.
    expect(result.tr.getMeta('box')).toEqual({ pos: 2 });
    const changed = state.apply(result.tr).doc.nodeAt(2)!;
    expect(changed.attrs.math).toEqual([{ kind: 'x' }]);
    expect(idOf(changed.attrs.insertion)).toBe('s0');
  });

  it('refuses a change to anyone else’s object, suggested or not, never folding it into theirs', () => {
    for (const attrs of [{}, { insertion: mark('b1', BEN) }]) {
      const theirs = equation(attrs);
      const state = stateWith([p('a', theirs, 'b')], 1);
      const markup = state.tr.setNodeMarkup(2, undefined, {
        ...theirs.attrs,
        math: [{ kind: 'x' }],
      });
      expect(suggestTransaction(state, markup, who())).toEqual({ refused: 'structure' });
      const attr = state.tr.setNodeAttribute(2, 'math', [{ kind: 'y' }]);
      expect(suggestTransaction(state, attr, who())).toEqual({ refused: 'structure' });
    }
  });

  it('sets an attribute of the person’s own suggested picture plainly', () => {
    const own = schema.nodes.picture!.create({
      media: 'm1',
      width: 1,
      height: 1,
      insertion: mark('s0'),
    });
    const state = stateWith([p('a', own)], 1);
    const next = suggest(state, state.tr.setNodeAttribute(2, 'alt', 'A cat'));
    expect(next.doc.nodeAt(2)!.attrs.alt).toBe('A cat');
    expect(idOf(next.doc.nodeAt(2)!.attrs.insertion)).toBe('s0');
  });

  it('suggests deleting someone else’s selected object, which stays', () => {
    const doc = schema.nodes.doc!.create(null, [p('a', equation(), 'b')]);
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 2) });
    const next = suggest(state, commanded(state, deleteSelection));
    expect(idOf(next.doc.nodeAt(2)!.attrs.deletion)).toBe('s1');
  });
});

describe('suggestTransaction on breaks and lines', () => {
  it('suggests a page break and a column break as a paragraph break carrying its break', () => {
    for (const [command, key] of [
      [insertPageBreak, 'pageBreakBefore'],
      [insertColumnBreak, 'columnBreakBefore'],
    ] as const) {
      const state = stateWith([p('onetwo')], 4);
      const next = suggest(state, commanded(state, command));
      expect(next.doc.childCount).toBe(2);
      const after = next.doc.child(1);
      expect(idOf(after.attrs.insertion)).toBe('s1');
      expect((after.attrs.props as Record<string, unknown>)[key]).toBe(true);
      expect(next.doc.child(0).attrs.insertion).toBeNull();
    }
  });

  it('suggests a horizontal line as a paragraph of its own, in a line’s middle and at a tab’s start', () => {
    const middle = stateWith([p('onetwo')], 4);
    const split = suggest(middle, commanded(middle, insertHorizontalLine));
    expect(split.doc.childCount).toBe(3);
    expect(idOf(split.doc.child(1).attrs.insertion)).toBe('s1');
    expect(split.doc.child(1).content.size).toBe(0);
    const start = stateWith([p('one')], 1);
    const first = suggest(start, commanded(start, insertHorizontalLine));
    expect(idOf(first.doc.child(0).attrs.insertion)).toBe('s1');
    expect(first.doc.child(0).attrs.props).toEqual({ borders: { bottom: expect.any(Object) } });
  });

  it('starts a suggestion of its own beside a paragraph whose start is the person’s own break', () => {
    const broken = schema.nodes.paragraph!.create({ insertion: mark('s0') }, schema.text('two'));
    const state = stateWith([p('one'), broken], 9);
    const next = suggest(state, commanded(state, insertHorizontalLine));
    expect(idOf(next.doc.child(1).attrs.insertion)).toBe('s0');
    expect(idOf(next.doc.child(2).attrs.insertion)).toBe('s1');
  });
});
