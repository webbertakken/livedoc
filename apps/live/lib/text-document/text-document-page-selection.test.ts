// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Transaction } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textDocumentSchema } from './text-document-schema';
import {
  keepUnreadSelection,
  pageSelectionPlugin,
  unreadSelection,
} from './text-document-page-selection';

// docs/specs/034-text-documents/editing-surface.md "The caret".

const s = textDocumentSchema;
const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) {
    view.destroy();
    view.dom.remove();
  }
});

/** "First line" and "Second line", the caret at the end, the editor focused on the page. */
function editor({ keep = true } = {}) {
  const doc = s.node('doc', null, [
    s.node('paragraph', null, [s.text('First line')]),
    s.node('paragraph', null, [s.text('Second line')]),
  ]);
  const view: EditorView = new EditorView(
    document.body.appendChild(document.createElement('div')),
    {
      state: EditorState.create({
        doc,
        plugins: [pageSelectionPlugin()],
        selection: TextSelection.create(doc, doc.content.size - 1),
      }),
      dispatchTransaction(tr: Transaction) {
        view.updateState(view.state.apply(keep ? keepUnreadSelection(view, tr) : tr));
      },
    },
  );
  views.push(view);
  view.focus();
  // The editor wrote its caret to the page: what it last left is recorded.
  view.dispatch(
    view.state.tr.setSelection(TextSelection.create(view.state.doc, doc.content.size - 1)),
  );
  return view;
}

/** The page's caret moved to the first line's start, as Ctrl+Home does, the editor not told yet. */
const movePageCaret = (view: EditorView) =>
  document.getSelection()!.collapse(view.dom.querySelector('p')!.firstChild, 0);

describe('unreadSelection', () => {
  it('is the page’s caret once it moved since the editor last left it, else nothing', () => {
    const view = editor();
    expect(unreadSelection(view)).toBeNull();
    movePageCaret(view);
    expect(unreadSelection(view)).toEqual({ anchor: 1, head: 1 });
  });

  it('is nothing where the page’s caret is the editor’s own, or the editor is not focused', () => {
    const view = editor();
    const end = view.dom.querySelectorAll('p')[1]!.firstChild!;
    document.getSelection()!.collapse(end, 'Second line'.length);
    expect(unreadSelection(view)).toBeNull();
    movePageCaret(view);
    const outside = document.body.appendChild(document.createElement('input'));
    outside.focus();
    expect(unreadSelection(view)).toBeNull();
    outside.remove();
  });

  it('is nothing while a node is selected, or for an editor it never recorded', () => {
    const view = editor();
    movePageCaret(view);
    const other = new EditorView(document.body.appendChild(document.createElement('div')), {
      state: EditorState.create({ doc: view.state.doc }),
    });
    views.push(other);
    expect(unreadSelection(other)).toBeNull();
    const picture = s.node('doc', null, [s.node('paragraph', null, [s.text('a')])]);
    view.updateState(
      EditorState.create({
        doc: picture,
        plugins: [pageSelectionPlugin()],
        selection: NodeSelection.create(picture, 0),
      }),
    );
    movePageCaret(view);
    expect(unreadSelection(view)).toBeNull();
  });
});

describe('keepUnreadSelection', () => {
  it('keeps the person’s newer caret through a change the editor makes on its own', () => {
    const view = editor();
    movePageCaret(view);
    // A collaborator's edit at the end, which sets no selection of its own.
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size - 1));
    expect(view.state.selection.head).toBe(1);
    expect(view.state.doc.lastChild!.textContent).toBe('Second line!');
  });

  it('puts back the older caret without it: the race it closes', () => {
    const view = editor({ keep: false });
    movePageCaret(view);
    view.dispatch(view.state.tr.insertText('!', view.state.doc.content.size - 1));
    expect(view.state.selection.head).not.toBe(1);
  });

  it('leaves a change that sets its own selection as it is', () => {
    const view = editor();
    movePageCaret(view);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
    expect(view.state.selection.head).toBe(3);
  });
});
