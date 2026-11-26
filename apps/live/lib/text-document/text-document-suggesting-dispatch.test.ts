// @vitest-environment jsdom
// docs/specs/034-text-documents/review.md "While suggesting": the editor's transactions rewritten while suggesting,
// refused ones dropped and said, what the room brings applied as it comes; in Editing, a split or paste leaves out
// what it copies of a suggestion.
import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { splitBlock } from 'prosemirror-commands';
import { ySyncPluginKey } from 'y-prosemirror';
import { textDocumentSchema as schema } from './text-document-schema';
import { dispatchWithSuggesting } from './text-document-suggesting-dispatch';

const ADA = { key: 'k-ada', name: 'Ada', colour: '#0284c7' };
const mark = { id: 's0', at: 1, author: ADA };

function viewOf(text: string, attrs: Record<string, unknown> = {}, caret = 3) {
  const doc = schema.nodes.doc!.create(null, [
    schema.nodes.paragraph!.create(attrs, schema.text(text)),
  ]);
  return new EditorView(document.createElement('div'), {
    state: EditorState.create({ doc, selection: TextSelection.create(doc, caret) }),
  });
}

const context = (suggesting: boolean) => ({
  suggester: () => (suggesting ? { ...ADA, now: 9, newId: () => 'new' } : null),
  onRefused: vi.fn(),
  onMade: vi.fn(),
});

describe('dispatchWithSuggesting', () => {
  it('rewrites a typed transaction as a suggestion while suggesting, telling what it began', () => {
    const view = viewOf('abcd');
    const ctx = context(true);
    dispatchWithSuggesting(view, view.state.tr.insertText('x'), ctx);
    expect(view.state.doc.firstChild!.child(1).marks.map((m) => m.type.name)).toEqual([
      'insertion',
    ]);
    expect(ctx.onMade).toHaveBeenCalledWith(['new']);
  });

  it('drops a refused transaction and says why', () => {
    const view = viewOf('abcd');
    const ctx = context(true);
    dispatchWithSuggesting(
      view,
      view.state.tr.insert(0, schema.nodes.section_break!.create()),
      ctx,
    );
    expect(view.state.doc.childCount).toBe(1);
    expect(ctx.onRefused).toHaveBeenCalledWith('structure');
  });

  it('applies what the room or an undo brings as it comes', () => {
    const view = viewOf('abcd');
    const tr = view.state.tr.insertText('x').setMeta(ySyncPluginKey, { isChangeOrigin: true });
    dispatchWithSuggesting(view, tr, context(true));
    expect(view.state.doc.textContent).toBe('abxcd');
    expect(view.state.doc.firstChild!.child(0).marks).toEqual([]);
  });

  it('in Editing, leaves out what a split copies of a suggested paragraph', () => {
    const view = viewOf('onetwo', { insertion: mark, formatChange: { ...mark, before: {} } }, 4);
    splitBlock(view.state, (tr) => dispatchWithSuggesting(view, tr, context(false)));
    expect(view.state.doc.child(0).attrs.insertion).toEqual(mark);
    expect(view.state.doc.child(1).attrs.insertion).toBeNull();
    expect(view.state.doc.child(1).attrs.formatChange).toBeNull();
  });

  it('in Editing, pastes suggested text as plain text', () => {
    const view = viewOf('ab');
    const pasted = schema.text('xy', [schema.marks.insertion!.create(mark)]);
    dispatchWithSuggesting(view, view.state.tr.insert(2, pasted), context(false));
    expect(view.state.doc.textContent).toBe('axyb');
    expect(view.state.doc.firstChild!.childCount).toBe(1);
  });
});
