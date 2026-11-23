// docs/specs/034-text-documents/objects.md "Horizontal line": an empty paragraph of the caret's style whose bottom border
// runs across the text width; at the caret the paragraph splits around it, a selection deleted first; at a paragraph's
// start before it, at its end after it with an empty paragraph to write in; Backspace after it takes it away.
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { PICTURE } from '@livedoc/text-documents';
import type { Node as PmNode } from 'prosemirror-model';
import { baseKeymap } from 'prosemirror-commands';
import { textDocumentSchema as schema } from './text-document-schema';
import { HORIZONTAL_LINE, insertHorizontalLine } from './text-document-horizontal-line';

const p = (text: string, attrs: Record<string, unknown> = {}) =>
  schema.nodes.paragraph!.create(attrs, text ? [schema.text(text)] : []);

function stateAt(doc: PmNode, from: number, to = from) {
  return EditorState.create({ doc, selection: TextSelection.create(doc, from, to) });
}

function run(state: EditorState): EditorState {
  let next = state;
  expect(insertHorizontalLine(state, (tr) => (next = state.apply(tr)))).toBe(true);
  return next;
}

const shape = (state: EditorState) =>
  state.doc.content.content.map((node) =>
    (node.attrs.props as { borders?: unknown } | null)?.borders ? '—' : node.textContent,
  );

describe('insertHorizontalLine', () => {
  it('is a solid grey line of 1 pt, 1 pt below an empty paragraph of the caret’s style', () => {
    expect(HORIZONTAL_LINE).toEqual({ width: 1, dash: 'solid', color: '#a6a6a6', space: 1 });
    const next = run(
      stateAt(
        schema.node('doc', null, [p('abcd', { style: 'Heading1', list: { id: 'l', level: 0 } })]),
        3,
      ),
    );
    const line = next.doc.child(1);
    expect(line.content.size).toBe(0);
    expect(line.attrs).toMatchObject({
      style: 'Heading1',
      list: null,
      props: { borders: { bottom: HORIZONTAL_LINE } },
    });
  });

  it('splits the paragraph at the caret, the caret starting the paragraph after the line', () => {
    const next = run(stateAt(schema.node('doc', null, [p('abcd')]), 3));
    expect(shape(next)).toEqual(['ab', '—', 'cd']);
    expect(next.selection.$from.parent.textContent).toBe('cd');
    expect(next.selection.$from.parentOffset).toBe(0);
  });

  it('deletes a selection first', () => {
    expect(shape(run(stateAt(schema.node('doc', null, [p('abcd')]), 2, 4)))).toEqual([
      'a',
      '—',
      'd',
    ]);
  });

  it('goes before a paragraph at its start, the caret staying in it', () => {
    const next = run(stateAt(schema.node('doc', null, [p('abcd')]), 1));
    expect(shape(next)).toEqual(['—', 'abcd']);
    expect(next.selection.$from.parent.textContent).toBe('abcd');
  });

  it('goes after a paragraph at its end, with an empty paragraph to write in when none follows', () => {
    const last = run(stateAt(schema.node('doc', null, [p('abcd')]), 5));
    expect(shape(last)).toEqual(['abcd', '—', '']);
    expect(last.selection.$from.parent.content.size).toBe(0);
    const followed = run(stateAt(schema.node('doc', null, [p('abcd'), p('next')]), 5));
    expect(shape(followed)).toEqual(['abcd', '—', 'next']);
    expect(followed.selection.$from.parent.textContent).toBe('next');
  });

  it('is taken away by Backspace at the start of the paragraph after it, that paragraph keeping its formatting', () => {
    const next = run(stateAt(schema.node('doc', null, [p('ab'), p('cd', { style: 'Title' })]), 5));
    let after = next;
    expect(baseKeymap.Backspace!(next, (tr) => (after = next.apply(tr)))).toBe(true);
    expect(shape(after)).toEqual(['ab', 'cd']);
    expect(after.doc.child(1).attrs.style).toBe('Title');
  });

  it('refuses with a picture selected', () => {
    const picture = schema.nodes[PICTURE]!.create({ media: 'm', width: 10, height: 10 });
    const doc = schema.node('doc', null, [schema.nodes.paragraph!.create(null, [picture])]);
    const state = EditorState.create({ doc, selection: NodeSelection.create(doc, 1) });
    expect(insertHorizontalLine(state)).toBe(false);
  });
});
