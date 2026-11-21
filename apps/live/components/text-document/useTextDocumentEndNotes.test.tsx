// @vitest-environment jsdom
// docs/specs/034-text-documents/page-layout.md "Footnotes", "Pageless": every mark's note under the writing, in order.
import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema } from '@/lib/text-document/text-document-schema';
import { endNotesOf, useTextDocumentEndNotes } from './useTextDocumentEndNotes';

const { nodes } = textDocumentSchema;
let view: EditorView;

const make = () => {
  const doc = nodes.doc!.create(null, [
    nodes.paragraph!.create(null, [
      textDocumentSchema.text('A'),
      nodes.footnote!.create({ story: 'a' }),
    ]),
    nodes.paragraph!.create(null, [nodes.footnote!.create({ story: 'b' })]),
  ]);
  view = new EditorView(document.body.appendChild(document.createElement('div')), {
    state: EditorState.create({ doc }),
  });
  view.dom.style.width = '500px';
  return view;
};

afterEach(() => view?.destroy());

describe('useTextDocumentEndNotes', () => {
  it('lists every mark’s note in order, numbered, at the writing’s width', () => {
    expect(endNotesOf(make(), 500)).toEqual([
      { story: 'a', key: 'a@500', number: 1, left: 0, width: 500 },
      { story: 'b', key: 'b@500', number: 2, left: 0, width: 500 },
    ]);
  });

  it('gives the same list while the notes are the same, and none where pages draw them', () => {
    make();
    let listener = () => {};
    const subscribe = (l: () => void) => {
      listener = l;
      return () => {};
    };
    const { result, rerender } = renderHook(
      ({ shown }) => useTextDocumentEndNotes(view, shown, subscribe),
      { initialProps: { shown: true } },
    );
    const first = result.current;
    expect(first.map((n) => n.number)).toEqual([1, 2]);
    act(() => {
      view.dispatch(view.state.tr.insertText('x', 1));
      listener();
    });
    expect(result.current).toBe(first);
    rerender({ shown: false });
    expect(result.current).toEqual([]);
  });
});
