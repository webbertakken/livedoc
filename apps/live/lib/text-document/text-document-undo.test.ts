// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { undo, ySyncPlugin, yUndoPluginKey } from 'y-prosemirror';
import { TEXT_DOCUMENT_UNDO_GROUP_MS, TextDocumentState } from '@livedoc/text-documents';
import { textDocumentSchema } from './text-document-schema';
import { textDocumentUndoPlugins } from './text-document-undo';

// docs/specs/034-text-documents/live-editing-and-storage.md "Undo": typing within 500 ms is one step.
describe('textDocumentUndoPlugins', () => {
  it('groups typing within the span into one step, and not past it', async () => {
    const doc = TextDocumentState.load();
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({
        schema: textDocumentSchema,
        plugins: [ySyncPlugin(TextDocumentState.body(doc)), ...textDocumentUndoPlugins()],
      }),
    });
    // The binding takes the editor over once its first render has run.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const undoManager = yUndoPluginKey.getState(view.state)!.undoManager;
    expect(undoManager.captureTimeout).toBe(TEXT_DOCUMENT_UNDO_GROUP_MS);
    const typeAt = (text: string) =>
      view.dispatch(view.state.tr.insertText(text, 1 + view.state.doc.textContent.length));
    typeAt('a');
    typeAt('b');
    // A pause past the span: the last change made that long ago.
    undoManager.lastChange -= TEXT_DOCUMENT_UNDO_GROUP_MS + 1;
    typeAt('c');
    expect(view.state.doc.textContent).toBe('abc');
    undo(view.state);
    expect(view.state.doc.textContent).toBe('ab');
    undo(view.state);
    expect(view.state.doc.textContent).toBe('');
    view.destroy();
  });
});
